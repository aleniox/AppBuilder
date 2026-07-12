import os
import re
import sys
from datetime import datetime
SPARKTTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Spark-TTS")
if os.path.isdir(SPARKTTS_DIR):
    sys.path.insert(0, SPARKTTS_DIR)
from tqdm import tqdm
import numpy as np
import soundfile as sf
import torch
import torchaudio.transforms as T
from transformers import Wav2Vec2FeatureExtractor, Wav2Vec2Model
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
        self.processor = Wav2Vec2FeatureExtractor.from_pretrained(
            f"{model_dir}/wav2vec2-large-xlsr-53"
        )
        self.feature_extractor = (
            Wav2Vec2Model.from_pretrained(f"{model_dir}/wav2vec2-large-xlsr-53")
            .to(device)
        )
        self.feature_extractor.config.output_hidden_states = True

    @torch.inference_mode()
    def extract_features(self, wavs):
        if wavs.shape[0] != 1:
            raise ValueError(f"Expected batch size 1, got {wavs.shape}")
        wav_np = wavs.squeeze(0).cpu().numpy()
        processed = self.processor(
            wav_np, sampling_rate=16000, return_tensors="pt", padding=True
        )
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


def split_text(text, max_chars=200):
    lines = text.strip().split('\n')
    sentences = []
    for line in lines:
        parts = re.split(r'(?<=[.!?…:;])["\']?(?:\s+|$)', line.strip())
        sentences.extend(s.strip() for s in parts if s.strip())
    if not sentences:
        sentences = [text.strip()]
    chunks, current = [], ""
    for s in sentences:
        if len(current) + len(s) > max_chars and current:
            chunks.append(current.strip())
            current = s
        else:
            current = (current + " " + s).strip()
    if current:
        chunks.append(current)
    return chunks


def load_reference_audio(audio_path, audio_tokenizer):
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
    del wav_t, ref_t, feat
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
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
        cumulative_probs = torch.cumsum(
            torch.nn.functional.softmax(sorted_logits, dim=-1), dim=-1
        )
        sorted_indices_to_remove = cumulative_probs > top_p
        sorted_indices_to_remove[..., 1:] = (
            sorted_indices_to_remove[..., :-1].clone()
        )
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
    eos_token_id = tokenizer.eos_token_id
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
    inputs = tokenizer(
        [prompt], return_tensors="pt", padding=True, truncation=True
    ).to(device)
    prompt_len = inputs.input_ids.shape[1]
    max_len = prompt_len + max_new_audio_tokens
    ids_buf = torch.zeros((1, max_len), dtype=torch.long, device=device)
    mask_buf = torch.zeros((1, max_len), dtype=torch.long, device=device)
    ids_buf[:, :prompt_len] = inputs.input_ids
    mask_buf[:, :prompt_len] = inputs.attention_mask
    pos = prompt_len
    for step in tqdm(range(max_new_audio_tokens), desc="Generating tokens", leave=False, disable=None):
        outputs = model(input_ids=ids_buf[:, :pos], attention_mask=mask_buf[:, :pos])
        logits = outputs.logits[0, -1, :]
        next_id = sample_logits(logits, temperature, top_k, top_p).item()
        ids_buf[0, pos] = next_id
        mask_buf[0, pos] = 1
        pos += 1
        if next_id == eos_token_id:
            break
    generated_ids = ids_buf[:, prompt_len:pos]
    predicts_text = tokenizer.batch_decode(
        generated_ids, skip_special_tokens=False
    )[0]
    semantic_matches = re.findall(r"bicodec_semantic_(\d+)", predicts_text)
    if not semantic_matches:
        return np.array([], dtype=np.float32)
    pred_semantic_ids = (
        torch.tensor([int(t) for t in semantic_matches]).long().unsqueeze(0)
    )
    global_matches = re.findall(r"bicodec_global_(\d+)", predicts_text)
    if ref_glo_ids is not None:
        pred_global_ids = ref_glo_ids.to(device)
    elif global_matches:
        pred_global_ids = (
            torch.tensor([int(t) for t in global_matches]).long().unsqueeze(0)
        )
        pred_global_ids = pred_global_ids.unsqueeze(0)
    else:
        pred_global_ids = torch.zeros((1, 1), dtype=torch.long, device=device)
    audio_tokenizer.device = device
    audio_tokenizer.model.to(device)
    wav_np = audio_tokenizer.detokenize(
        pred_global_ids.to(device).squeeze(0),
        pred_semantic_ids.to(device),
    )
    return wav_np


def _make_output_dir(text, base_dir="outputs"):
    date_str = datetime.now().strftime("%Y%m%d")
    words = text.strip().split()[:5]
    safe = re.sub(r'[^\w-]', '', "_".join(words))[:60]
    out = os.path.join(base_dir, f"{date_str}_{safe}")
    os.makedirs(out, exist_ok=True)
    return out


class SparkTTSEngine:
    def __init__(
        self,
        base_model: str,
        lora_path: str = None,
        device: str = "cuda" if torch.cuda.is_available() else "cpu",
        ref_audio: str = None,
    ):
        self.device = torch.device(device)
        self.base_model = base_model
        self._load_llm(lora_path)
        self._load_audio_tokenizer()
        self._ref_glo_ids = None
        if ref_audio and os.path.isfile(ref_audio):
            self.load_reference(ref_audio)

    def _load_llm(self, lora_path=None):
        self.model, self.tokenizer = FastModel.from_pretrained(
            model_name=f"{self.base_model}/LLM",
            max_seq_length=2048,
            load_in_4bit=False,
            full_finetuning=False,
            load_in_16bit=True
        )
        if lora_path and os.path.isdir(lora_path):
            self.model = PeftModel.from_pretrained(self.model, lora_path)
        FastModel.for_inference(self.model)
        self.model.to(self.device)

    def _load_audio_tokenizer(self):
        self.audio_tokenizer = FastAudioTokenizer(self.base_model, self.device)

    def load_reference(self, audio_path: str):
        self._ref_glo_ids, _ = load_reference_audio(audio_path, self.audio_tokenizer)

    @torch.inference_mode()
    def synthesize(
        self,
        text: str,
        ref_audio: str = None,
        temperature: float = 0.8,
        top_k: int = 50,
        top_p: float = 1.0,
        max_tokens: int = 2048,
        max_chunk_chars: int = 200,
    ) -> np.ndarray:
        if ref_audio:
            glo_ids, _ = load_reference_audio(ref_audio, self.audio_tokenizer)
        else:
            glo_ids = self._ref_glo_ids
        chunks = split_text(text, max_chunk_chars)
        
        if len(chunks) <= 1:
            return generate_speech(
                text, self.model, self.tokenizer, self.audio_tokenizer,
                ref_glo_ids=glo_ids,
                temperature=temperature,
                top_k=top_k,
                top_p=top_p,
                max_new_audio_tokens=max_tokens,
                device=self.device,
            )
        parts = []
        for chunk in tqdm(chunks, desc="Processing chunks"):
            wav = generate_speech(
                chunk, self.model, self.tokenizer, self.audio_tokenizer,
                ref_glo_ids=glo_ids,
                temperature=temperature,
                top_k=top_k,
                top_p=top_p,
                max_new_audio_tokens=max_tokens,
                device=self.device,
            )
            if wav.size > 0:
                parts.append(wav)
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        return np.concatenate(parts) if parts else np.array([], dtype=np.float32)

    def synthesize_to_file(
        self,
        text: str,
        output_path: str,
        ref_audio: str = None,
        temperature: float = 0.8,
        top_k: int = 50,
        top_p: float = 1.0,
        max_tokens: int = 3000,
    ):
        wav = self.synthesize(text, ref_audio, temperature, top_k, top_p, max_tokens)
        if wav.size > 0:
            sr = self.audio_tokenizer.config.get("sample_rate", 16000)
            sf.write(output_path, wav, sr)
            return output_path
        return None

    def synthesize_to_folder(
        self,
        text: str,
        ref_audio: str = None,
        temperature: float = 0.8,
        top_k: int = 50,
        top_p: float = 1.0,
        max_tokens: int = 3000,
        max_chunk_chars: int = 200,
        base_dir: str = "outputs",
        progress_callback=None,
    ) -> str:
        out_dir = _make_output_dir(text, base_dir)
        sr = self.audio_tokenizer.config.get("sample_rate", 16000)

        if ref_audio:
            glo_ids, _ = load_reference_audio(ref_audio, self.audio_tokenizer)
        else:
            glo_ids = self._ref_glo_ids

        chunks = split_text(text, max_chunk_chars)

        if progress_callback:
            progress_callback(0)

        if len(chunks) <= 1:
            wav = generate_speech(
                text, self.model, self.tokenizer, self.audio_tokenizer,
                ref_glo_ids=glo_ids,
                temperature=temperature, top_k=top_k, top_p=top_p,
                max_new_audio_tokens=max_tokens, device=self.device,
            )
            if wav.size > 0:
                sf.write(os.path.join(out_dir, "chunk_001.wav"), wav, sr)
                sf.write(os.path.join(out_dir, "full.wav"), wav, sr)
            if progress_callback:
                progress_callback(100)
            return out_dir

        parts = []
        total = len(chunks)
        for i, chunk in tqdm(enumerate(chunks, 1), total=total, desc="Processing chunks"):
            if progress_callback:
                progress_callback(int((i - 1) / total * 100))
            wav = generate_speech(
                chunk, self.model, self.tokenizer, self.audio_tokenizer,
                ref_glo_ids=glo_ids,
                temperature=temperature, top_k=top_k, top_p=top_p,
                max_new_audio_tokens=max_tokens, device=self.device,
            )
            if wav.size > 0:
                sf.write(os.path.join(out_dir, f"chunk_{i:03d}.wav"), wav, sr)
                parts.append(wav)
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

        if parts:
            sf.write(os.path.join(out_dir, "full.wav"), np.concatenate(parts), sr)
        if progress_callback:
            progress_callback(100)
        return out_dir


_engine_instance = None


def get_engine(
    base_model: str = None,
    lora_path: str = None,
    ref_audio: str = None,
    device: str = None,
) -> SparkTTSEngine:
    global _engine_instance
    if _engine_instance is None:
        if base_model is None:
            base_model = os.path.join(
                os.path.dirname(os.path.abspath(__file__)), "Spark-TTS-0.5B"
            )
        if device is None:
            device = "cuda" if torch.cuda.is_available() else "cpu"
        _engine_instance = SparkTTSEngine(base_model, lora_path, device, r"F:\WebEdit\video-editor\audio_speaker.mp3")
    return _engine_instance


def synthesize_text(
    text: str,
    ref_audio: str = None,
    output_path: str = None,
    output_dir: str = None,
    **kwargs,
) -> str | np.ndarray:
    engine = get_engine(ref_audio=ref_audio)
    if output_dir:
        return engine.synthesize_to_folder(
            text, ref_audio=ref_audio, base_dir=output_dir, **kwargs
        )
    if output_path:
        return engine.synthesize_to_file(text, output_path, ref_audio=ref_audio, **kwargs)
    return engine.synthesize(text, ref_audio=ref_audio, **kwargs)
