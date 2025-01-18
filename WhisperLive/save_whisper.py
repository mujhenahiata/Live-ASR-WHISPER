from transformers import WhisperTokenizer, WhisperForConditionalGeneration

# Specify the model you want to load, e.g., "openai/whisper-small"
model_name = "openai/whisper-large"

# Load the tokenizer and model
tokenizer = WhisperTokenizer.from_pretrained(model_name, cache_dir = "whisper_model")
model = WhisperForConditionalGeneration.from_pretrained(model_name, cache_dir = "whisper_model")

# Define the path to save the model locally
save_path = "whisper_model"  # Replace with your desired local path

# Save the model and tokenizer locally
model.save_pretrained(save_path)
tokenizer.save_pretrained(save_path)

print(f"Model and tokenizer saved to {save_path}")