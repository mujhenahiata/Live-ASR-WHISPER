import React, { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { MongoClient, ObjectId } from 'mongodb';
import * as Minio from 'minio';

// Initialize MinIO client
const minioClient = new Minio.Client({
  endPoint: 'http://172.20.10.6',
  port: 9000,
  useSSL: false,
  accessKey: 'minioadmin',
  secretKey: 'minioadmin',
});

// Initialize MongoDB client
const uri = 'mongodb://localhost:27017/supremecourt';
const client = new MongoClient(uri);

const App = () => {
  const [uid, setUid] = useState(null);
  const [socket, setSocket] = useState(null);
  const [transcript, setTranscript] = useState(null);
  const [stream, setStream] = useState(null);
  const [audioDataCache, setAudioDataCache] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [recording, setRecording] = useState(false);
  const transcriptDiv = useRef(null);
  const [timestamp, setTimestamp] = useState(null);

  const env = { PUBLIC_WEBSOCKET_URL: 'ws://localhost:9090' };

  const [caseID, setCaseID] = useState('');
  const [recordings, setRecordings] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  

  const handleRecord = () => {
    setIsRecording(true);
    // Start recording logic here
  };

  const handleStop = () => {
    setIsRecording(false);
    // Stop recording logic here
  };

  const handleCaseIDChange = (event) => {
    setCaseID(event.target.value);
  };


  const scrollToBottom = () => {
    if (transcriptDiv.current) {
      transcriptDiv.current.scroll({ top: transcriptDiv.current.scrollHeight, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [transcript]);

  useEffect(() => {
    // Connect to MongoDB on component mount
    const connectToMongoDB = async () => {
      try {
        await client.connect();
        console.log('Connected to MongoDB');
      } catch (error) {
        console.error('Error connecting to MongoDB:', error);
      }
    };
    connectToMongoDB();

    // Cleanup MongoDB connection on component unmount
    return () => {
      client.close();
    };
  }, []);


  const filteredTranscript = transcript
    ? transcript.segments.filter(segment =>
        segment.text.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const resampleTo16kHZ = (audioData, origSampleRate = 44100) => {
    const data = new Float32Array(audioData);
    const targetLength = Math.round(data.length * (16000 / origSampleRate));
    const resampledData = new Float32Array(targetLength);

    const springFactor = (data.length - 1) / (targetLength - 1);
    resampledData[0] = data[0];
    resampledData[targetLength - 1] = data[data.length - 1];

    for (let i = 1; i < targetLength - 1; i++) {
      const index = i * springFactor;
      const leftIndex = Math.floor(index);
      const rightIndex = Math.ceil(index);
      const fraction = index - leftIndex;
      resampledData[i] = data[leftIndex] + (data[rightIndex] - data[leftIndex]) * fraction;
    }

    return resampledData;
  };

  const startRecording = async () => {
    setTranscript(null);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    setStream(stream);

    const uid = uuidv4();
    setUid(uid);
    setTimestamp(new Date());

    const newSocket = new WebSocket(env.PUBLIC_WEBSOCKET_URL);
    setSocket(newSocket);

    let isServerReady = false;

    newSocket.onopen = () => {
      newSocket.send(
        JSON.stringify({
          uid,
          language: null,
          translate: false, // This line ensures no translation
          multilingual: true,
          task: 'transcribe',
        })
      );
    };
    newSocket.onerror = (event) => {
      console.error("WebSocket error:", event);
    };

    newSocket.onmessage = event => {
      const data = JSON.parse(event.data);

      if (data.uid !== uid) return;

      if (data?.message === 'SERVER_READY') {
        console.log('Server ready');
        isServerReady = true;
        return;
      }

      if (data.message === 'DISCONNECTED') {
        console.log('Server disconnected');
        newSocket.close();
        return;
      }

      const updatedTranscript = JSON.parse(event.data);
      updatedTranscript.segments = updatedTranscript.segments.map(segment => ({
        ...segment,
        duration: (segment.end - segment.start).toFixed(2),
        start: timestampFromSeconds(segment.start),
        end: timestampFromSeconds(segment.end),
      }));
      setTranscript(updatedTranscript);
    };

    const context = new AudioContext();
    const mediaStream = context.createMediaStreamSource(stream);
    const recorder = context.createScriptProcessor(4096, 1, 1);

    recorder.onaudioprocess = event => {
      if (!context || !isServerReady) return;

      const inputData = event.inputBuffer.getChannelData(0);
      const audioData16kHz = resampleTo16kHZ(inputData, context.sampleRate);

      setAudioDataCache(prev => [...prev, inputData]);
      newSocket.send(audioData16kHz);
    };

    mediaStream.connect(recorder);
    recorder.connect(context.destination);
    setRecording(true);
  };

  const stopRecording = async () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      setRecording(false);
    }
  
    if (socket) {
      socket.close();
      setSocket(null);
    }
  
    setAudioDataCache([]);
  
  
    try {
      // 1. Generate a unique hash for the audio file
      const audioHash = uuidv4();
  
      // 2. Convert audioDataCache to a Blob
      const audioBlob = new Blob(audioDataCache, { type: 'audio/wav' });
  
      // 3. Upload audio to MinIO
      await minioClient.putObject('trialsuperemcourt', `${audioHash}.wav`, audioBlob);
      console.log('Audio uploaded to MinIO');
  
      // 4. Save transcript and audio hash to MongoDB
      const db = client.db('supremecourt');
      const casesCollection = db.collection('cases');
      await casesCollection.updateOne(
        { _id: new ObjectId(caseID) }, // Assuming caseID is the MongoDB document ID
        {
          $push: {
            proceedings: {
              date: new Date().toISOString().split('T')[0],
              startTime: timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              endTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              transcript: transcript.segments,
              audioHash: audioHash,
            },
          },
        }
      );
      console.log('Transcript and audio hash saved to MongoDB');
  
      // 5. Update recordings state (optional)
      setRecordings((prevRecordings) => [
        ...prevRecordings,
        { id: audioHash, name: `Recording ${prevRecordings.length + 1}`, date: new Date().toLocaleDateString() },
      ]);
    } catch (error) {
      console.error('Error saving recording:', error);
    }
  };

  const recordingButtonClicked = () => {
    if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const highlightMatchingWords = text => {
    const query = searchQuery.toLowerCase();
    const regex = new RegExp(query, 'gi');
    return text.replace(regex, match => `<span class="highlight">${match}</span>`);
  };

  const downloadTranscript = () => {
    if (!transcript) return;

    const transcriptText = transcript.segments
      .map((segment, i) => `${i}\n${segment.start} --> ${segment.end}\n${segment.text}`)
      .join('\n');

    const blob = new Blob([transcriptText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'transcript.txt';
    a.click();

    URL.revokeObjectURL(url);
  };

  const timestampFromSeconds = seconds => {
    const newTimestamp = new Date(timestamp);
    newTimestamp.setSeconds(newTimestamp.getSeconds() + seconds);
    return newTimestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const playRecording = async (audioHash) => {
    try {
      // 1. Get audio URL from MinIO
      const audioURL = await minioClient.presignedUrl('GET', 'trialsuperemcourt', `${audioHash}.wav`);

      // 2. Create an audio element and play the recording
      const audio = new Audio(audioURL);
      audio.play();

      // 3. Fetch the corresponding transcript from MongoDB
      const db = client.db('supremecourt');
      const casesCollection = db.collection('cases');
      const caseData = await casesCollection.findOne(
        { _id: new ObjectId(caseID) }, // Assuming caseID is the MongoDB document ID
        {
          projection: {
            proceedings: {
              $elemMatch: { audioHash: audioHash },
            },
          },
        }
      );
      const transcript = caseData.proceedings[0].transcript;

      // 4. Display the transcript (you might need to update your UI for this)
      setTranscript({ segments: transcript });
    } catch (error) {
      console.error('Error playing recording:', error);
    }
  };

  return (
<div className="flex h-screen bg-gray-100 font-sans">
  <aside className="w-1/4 bg-white shadow-md p-6">
    <h1 className="text-2xl font-bold mb-6 text-gray-800">Application Name</h1>
    <div className="mb-6">
      <h2 className="text-lg font-semibold mb-2 text-gray-700">OPTIONS</h2>
      <button
  onClick={recordingButtonClicked}
  className={`bg-${isRecording ? 'red-600' : 'black'} hover:bg-${isRecording ? 'red-700' : 'gray-800'} text-white font-medium py-2 px-4 rounded-md focus:outline-none focus:shadow-outline`}
>
  {isRecording ? 'Stop Recording' : 'Start Recording'}
</button>
    </div>
    <div className="mb-6">
      <h2 className="text-lg font-semibold mb-2 text-gray-700">Recordings</h2>
        <ul>
          {recordings.map((recording) => (
            <li key={recording.id} className="text-gray-600 hover:bg-gray-100 px-2 py-1 rounded-md">
              {recording.name} - {recording.date}
              <button onClick={() => playRecording(recording.id)}>Play</button>
            </li>
          ))}
        </ul>
    </div>
    {/* <div className="mb-6">
      <h2 className="text-lg font-semibold mb-2 text-gray-700">Recordings</h2>
      <ul>
        {recordings.map((recording) => (
          <li
            key={recording.id}
            className="text-gray-600 hover:bg-gray-100 px-2 py-1 rounded-md"
          >
            {recording.name} - {recording.date}
          </li>
        ))}
      </ul> */}
    {/* </div> */}
    <div className="mb-6">
      <h2 className="text-lg font-semibold mb-2 text-gray-700">Settings</h2>
      <button
        className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-medium py-2 px-4 rounded-md focus:outline-none focus:shadow-outline"
      >
        Open Settings
      </button>
    </div>
    <button className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-medium py-2 px-4 rounded-md focus:outline-none focus:shadow-outline">
      Logout
    </button>
  </aside>

  <main className="w-3/4 p-6">
    <div className="flex items-center justify-between mb-6">
      <div className="relative w-full">
        <svg
          className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-10 pr-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:shadow-outline focus:border-blue-300 w-full"
          placeholder="Search"
        />
      </div>
    </div>
    <div className="mb-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Transcript</h2>
      <div className="border rounded-md p-4 bg-white shadow-sm">
        {filteredTranscript.length > 0 ? (
          filteredTranscript.map((segment, i) => (
            <div key={i} className="mb-4">
              <div className="text-sm text-gray-500">
                <p>Start: {segment.start}</p>
                <p>Duration: {segment.duration}s</p>
                <p>End: {segment.end}</p>
              </div>
              <p
                className="text-gray-700"
                dangerouslySetInnerHTML={{
                  __html: highlightMatchingWords(segment.text),
                }}
              />
            </div>
          ))
        ) : (
          <p className="text-gray-500">No matching results</p>
        )}
      </div>
    </div>
    <div>
      <label htmlFor="caseID" className="block text-gray-700 font-bold mb-2">
        Case ID
      </label>
      <select
        id="caseID"
        className="border rounded-md px-3 py-2 w-full focus:outline-none focus:shadow-outline focus:border-blue-300"
        value={caseID}
        onChange={handleCaseIDChange}
      >
        <option value="">Select Case ID</option>
        <option value="12345">Case 12345</option>
        {/* Additional case IDs */}
      </select>
    </div>
  </main>
</div>

  );
};

export default App;