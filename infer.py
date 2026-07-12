import modules.sparktts_infer as sparktts_infer
import numpy as np
import io
import soundfile as sf
import os

modules_dir = r"F:\WebEdit\video-editor\modules"
REF_AUDIO = os.path.join(modules_dir, "..", "audio_speaker.mp3")

engine = sparktts_infer.SparkTTSEngine(
    base_model=os.path.join(modules_dir, "Spark-TTS-0.5B"),
    lora_path=r"F:\WebEdit\video-editor\modules\spark_tts_lora",
    ref_audio=REF_AUDIO,
)

text = """
Chúng ta sẽ vào trang chủ của visual studio code để tải phần mềm về nếu các bạn chưa tải, ở đây mình tải rồi nên mình sẽ không tải lại nữa. 
"""

wav: np.ndarray = engine.synthesize_to_folder(text)
sr = engine.audio_tokenizer.config.get("sample_rate", 16000)

