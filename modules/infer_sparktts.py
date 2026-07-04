import os
os.environ["CUDA_VISIBLE_DEVICES"] = "0"
import sys
import re
import argparse
import numpy as np
import torch
import torchaudio.transforms as T
from transformers import Wav2Vec2FeatureExtractor, Wav2Vec2Model
from huggingface_hub import snapshot_download
snapshot_download("unsloth/Spark-TTS-0.5B", local_dir="Spark-TTS-0.5B")
SPARKTTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Spark-TTS")
if os.path.isdir(SPARKTTS_DIR):
    sys.path.insert(0, SPARKTTS_DIR)

from unsloth import FastModel
from peft import PeftModel
from sparktts.models.bicodec import BiCodec
from sparktts.utils.file import load_config
from sparktts.utils.audio import audio_volume_normalize

class FastAudioTokenizer:
    def __init__(self, model_dir, device="cuda"):
        self.device = device
        self.model_dir = model_dir
        self.config = load_config(f"{model_dir}/config.yaml")
        self.model = BiCodec.load_from_checkpoint(f"{model_dir}/BiCodec").to(device)
        self.processor = Wav2Vec2FeatureExtractor.from_pretrained(f"{model_dir}/wav2vec2-large-xlsr-53")
        self.feature_extractor = (
            Wav2Vec2Model.from_pretrained(f"{model_dir}/wav2vec2-large-xlsr-53").to(device)
        )
        self.feature_extractor.config.output_hidden_states = True

    @torch.inference_mode()
    def extract_features(self, wavs):
        if wavs.shape[0] != 1:
            raise ValueError(f"Expected batch size 1, got {wavs.shape}")
        wav_np = wavs.squeeze(0).cpu().numpy()
        processed = self.processor(wav_np, sampling_rate=16000, return_tensors="pt", padding=True)
        out = self.feature_extractor(processed.input_values.to(self.device))
        hs = out.hidden_states
        feats = (hs[11] + hs[14] + hs[16]) / 3
        return feats

    def get_ref_clip(self, wav):
        ref_len = (
            int(self.config["sample_rate"] * self.config["ref_segment_duration"])
            // self.config["latent_hop_length"]
            * self.config["latent_hop_length"]
        )
        wav_len = len(wav)
        if ref_len > wav_len:
            wav = np.tile(wav, ref_len // wav_len + 1)
        return wav[:ref_len]

    @torch.inference_mode()
    def detokenize(self, global_tokens, semantic_tokens):
        global_tokens = global_tokens.unsqueeze(1)
        wav_rec = self.model.detokenize(semantic_tokens, global_tokens)
        return wav_rec.detach().squeeze().cpu().numpy()


def load_reference_audio(audio_path, audio_tokenizer):
    import soundfile as sf
    arr, sr = sf.read(audio_path)
    if len(arr.shape) > 1:
        arr = arr.mean(axis=1)
    target_sr = audio_tokenizer.config["sample_rate"]
    if sr != target_sr:
        resampler = T.Resample(orig_freq=sr, new_freq=target_sr)
        arr = resampler(torch.from_numpy(arr).float()).numpy()
    if audio_tokenizer.config.get("volume_normalize"):
        arr = audio_volume_normalize(arr)
    ref_np = audio_tokenizer.get_ref_clip(arr)
    wav_t = torch.from_numpy(arr).unsqueeze(0).float().to(audio_tokenizer.device)
    ref_t = torch.from_numpy(ref_np).unsqueeze(0).float().to(audio_tokenizer.device)
    feat = audio_tokenizer.extract_features(wav_t)
    sem_ids, glo_ids = audio_tokenizer.model.tokenize({
        "wav": wav_t, "ref_wav": ref_t, "feat": feat,
    })
    return glo_ids, sem_ids


def tok_str(ids, prefix):
    return "".join(f"<|bicodec_{prefix}_{i}|>" for i in ids.cpu().numpy().flatten())


def sample_logits(logits, temperature, top_k, top_p):
    logits = logits / max(temperature, 1e-6)

    if top_k > 0:
        values, _ = torch.topk(logits, min(top_k, logits.size(-1)))
        kth = values[-1].unsqueeze(-1)
        logits[logits < kth] = float("-inf")

    if top_p < 1.0:
        sorted_logits, sorted_indices = torch.sort(logits, descending=True, stable=True)
        cumulative_probs = torch.cumsum(torch.nn.functional.softmax(sorted_logits, dim=-1), dim=-1)
        sorted_indices_to_remove = cumulative_probs > top_p
        sorted_indices_to_remove[..., 1:] = sorted_indices_to_remove[..., :-1].clone()
        sorted_indices_to_remove[..., 0] = 0
        indices_to_remove = sorted_indices_to_remove.scatter(
            dim=-1, index=sorted_indices, src=sorted_indices_to_remove
        )
        logits[indices_to_remove] = float("-inf")

    probs = torch.nn.functional.softmax(logits, dim=-1)
    return torch.multinomial(probs, num_samples=1)


@torch.inference_mode()
def generate_speech(
    text,
    model,
    tokenizer,
    audio_tokenizer,
    ref_glo_ids=None,
    temperature=0.8,
    top_k=50,
    top_p=1.0,
    max_new_audio_tokens=3000,
    device=torch.device("cuda" if torch.cuda.is_available() else "cpu"),
):
    torch.compiler.reset()

    eos_token_id = tokenizer.eos_token_id  # <|im_end|> = 151645

    if ref_glo_ids is not None:
        prompt = "".join([
            "<|task_tts|><|start_content|>", text, "<|end_content|>",
            "<|start_global_token|>", tok_str(ref_glo_ids, "global"),
            "<|end_global_token|>",
        ])
    else:
        prompt = "".join([
            "<|task_tts|><|start_content|>", text, "<|end_content|>",
            "<|start_global_token|>",
        ])

    inputs = tokenizer([prompt], return_tensors="pt", padding=True, truncation=True).to(device)
    input_ids = inputs.input_ids
    attention_mask = inputs.attention_mask

    print("Generating token sequence...")
    for step in range(max_new_audio_tokens):
        outputs = model(input_ids=input_ids, attention_mask=attention_mask)
        logits = outputs.logits[0, -1, :]

        next_token = sample_logits(logits, temperature, top_k, top_p)
        next_id = next_token.item()

        input_ids = torch.cat([input_ids, next_token.unsqueeze(0)], dim=1)
        attention_mask = torch.cat([attention_mask, torch.ones((1, 1), device=device)], dim=1)

        if next_id == eos_token_id:
            break

    print(f"Token sequence generated. Total tokens: {input_ids.shape[1] - inputs.input_ids.shape[1]}")

    generated_ids = input_ids[:, inputs.input_ids.shape[1]:]
    predicts_text = tokenizer.batch_decode(generated_ids, skip_special_tokens=False)[0]

    print(f"Raw generated (first 500 chars):\n{predicts_text[:500]}\n")

    semantic_matches = re.findall(r"bicodec_semantic_(\d+)", predicts_text)
    if not semantic_matches:
        print("Warning: No semantic tokens found.")
        print("Full raw output:\n", predicts_text[:2000])
        return np.array([], dtype=np.float32)

    pred_semantic_ids = torch.tensor([int(t) for t in semantic_matches]).long().unsqueeze(0)

    global_matches = re.findall(r"bicodec_global_(\d+)", predicts_text)
    if ref_glo_ids is not None:
        pred_global_ids = ref_glo_ids.to(device)
    elif global_matches:
        pred_global_ids = torch.tensor([int(t) for t in global_matches]).long().unsqueeze(0)
        pred_global_ids = pred_global_ids.unsqueeze(0)
    else:
        print("Warning: No global tokens found. Using zeros.")
        pred_global_ids = torch.zeros((1, 1), dtype=torch.long, device=device)

    print(f"Found {pred_semantic_ids.shape[1]} semantic tokens.")
    print("Detokenizing audio tokens...")
    audio_tokenizer.device = device
    audio_tokenizer.model.to(device)
    wav_np = audio_tokenizer.detokenize(
        pred_global_ids.to(device).squeeze(0),
        pred_semantic_ids.to(device),
    )
    print("Detokenization complete.")

    return wav_np


def find_latest_checkpoint(output_dir):
    if not os.path.isdir(output_dir):
        return None
    checkpoints = [d for d in os.listdir(output_dir) if d.startswith("checkpoint-")]
    if not checkpoints:
        return None
    checkpoints.sort(key=lambda x: int(x.split("-")[1]))
    return os.path.join(output_dir, checkpoints[-1])


def main():
    parser = argparse.ArgumentParser(description="Infer SparkTTS with LoRA")
    parser.add_argument("--text", type=str, required=True,
                        help="Text to synthesize")
    parser.add_argument("--output", type=str, default="output.wav",
                        help="Output audio file path")
    parser.add_argument("--base-model", type=str, default="Spark-TTS-0.5B",
                        help="Path to the base SparkTTS model directory")
    parser.add_argument("--lora-path", type=str, default=None,
                        help="Path to the LoRA adapter (default: latest from outputs/)")
    parser.add_argument("--ref-audio", type=str, required=True,
                        help="Reference audio for voice cloning (required)")
    parser.add_argument("--temperature", type=float, default=0.8)
    parser.add_argument("--top-k", type=int, default=50)
    parser.add_argument("--top-p", type=float, default=1.0)
    parser.add_argument("--max-tokens", type=int, default=3000)
    parser.add_argument("--device", type=str, default="cuda" if torch.cuda.is_available() else "cpu")
    parser.add_argument("--gpu", type=str, default="0", help="GPU device ID")
    args = parser.parse_args()

    os.environ["CUDA_VISIBLE_DEVICES"] = args.gpu
    device = torch.device(args.device)

    print(f"Loading base model from {args.base_model}...")
    model, tokenizer = FastModel.from_pretrained(
        model_name=f"{args.base_model}/LLM",
        max_seq_length=2048,
        load_in_4bit=False,
        full_finetuning=False,
    )

    lora_path = args.lora_path
    if lora_path is None:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        outputs_dir = os.path.join(script_dir, "outputs")
        lora_path = find_latest_checkpoint(outputs_dir)
        if lora_path is None:
            print("No --lora-path specified and no checkpoints found in outputs/. Using base model only.")
        else:
            print(f"Auto-detected latest checkpoint: {lora_path}")

    if lora_path and os.path.isdir(lora_path):
        print(f"Loading LoRA adapter from {lora_path}...")
        model = PeftModel.from_pretrained(model, lora_path)
    FastModel.for_inference(model)

    print(f"Loading audio tokenizer from {args.base_model}...")
    audio_tokenizer = FastAudioTokenizer(args.base_model, device)

    print(f"Loading reference audio from {args.ref_audio}...")
    ref_glo_ids, _ = load_reference_audio(args.ref_audio, audio_tokenizer)

    wav = generate_speech(
        args.text, model, tokenizer, audio_tokenizer,
        ref_glo_ids=ref_glo_ids,
        temperature=args.temperature,
        top_k=args.top_k,
        top_p=args.top_p,
        max_new_audio_tokens=args.max_tokens,
        device=device,
    )

    if wav.size > 0:
        import soundfile as sf
        sample_rate = audio_tokenizer.config.get("sample_rate", 16000)
        sf.write(args.output, wav, sample_rate)
        print(f"Audio saved to {args.output}")
    else:
        print("Audio generation failed.")


if __name__ == "__main__":
    main()