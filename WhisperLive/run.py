from whisper_live.client import TranscriptionClient
client = TranscriptionClient(
  "localhost",
  9090,
)
client("tests\trial.flac")