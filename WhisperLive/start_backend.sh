#!/bin/bash

# Kill all terminals (optional, use with caution)
# killall gnome-terminal

# Run your backend server
bash -c  "source env/Scripts/activate && python run_server.py --port 9090 --backend faster_whisper --faster_whisper_custom_model_path ./faster-whisper-large-v3 && exec bash"