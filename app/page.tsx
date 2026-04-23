"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, FileAudio, Play, Copy, Download, Loader2, X, Mic, Pause, Square } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function AudioTranscriber() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [subtitle, setSubtitle] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Timer effect
  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording, isPaused]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const ext = mimeType.includes('webm') ? 'webm' : 'mp4';
        const recorded = new File([blob], `recorded-audio.${ext}`, { type: mimeType });
        setFile(recorded);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };
      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsRecording(true);
      setIsPaused(false);
      setElapsed(0);
      setFile(null);
    } catch {
      alert('Microphone access denied or unavailable.');
    }
  }, []);

  const pauseRecording = useCallback(() => {
    mediaRecorderRef.current?.pause();
    setIsPaused(true);
  }, []);

  const resumeRecording = useCallback(() => {
    mediaRecorderRef.current?.resume();
    setIsPaused(false);
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    setIsPaused(false);
  }, []);

  const handleTranscribe = async () => {
    if (!file) return;
    setIsUploading(true);
    setSubtitle(null);
    setProgress(0);
    setStatusMsg("Uploading audio…");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await fetch(`${API_URL}/api/v1/transcribe/`, {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) throw new Error("Upload failed");

      const { job_id } = await uploadRes.json();
      setStatusMsg("AI Processing…");

      // 2. Poll for result
      const poll = async (): Promise<string> => {
        const res = await fetch(`${API_URL}/api/v1/transcribe/status/${job_id}`);
        const data = await res.json();

        // Hybrid Progress: Blend real progress with optimistic UI for short files
        if (data.status !== "completed") {
          setProgress((prev) => {
            const apiProg = data.progress || 0;
            // Optimistic fake bump so it never freezes
            const increment = prev < 30 ? Math.random() * 5 : prev < 70 ? Math.random() * 2 : Math.random() * 0.5;
            const simulatedProg = prev + increment;

            // Take the highest value but cap at 95% until actually complete
            return Math.min(95, Math.max(simulatedProg, apiProg));
          });
        }

        if (data.status === "completed") {
          setProgress(100);
          return data.result;
        }
        if (data.status === "failed") throw new Error(data.error || "Transcription failed");

        await new Promise((r) => setTimeout(r, 1000));
        return poll();
      };

      const result = await poll();

      setTimeout(() => setSubtitle(result), 600);

    } catch (err: unknown) {
      setProgress(0);
      const message = err instanceof Error ? err.message : "Unknown error";
      alert(`Error: ${message}`);
    } finally {
      setTimeout(() => {
        setIsUploading(false);
        setStatusMsg("");
      }, 600);
    }
  };

  const downloadSRT = () => {
    if (!subtitle) return;
    const blob = new Blob([subtitle], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'subtitles.srt';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 lg:p-8 overflow-y-auto flex flex-col">
      <div className="w-full max-w-7xl mx-auto flex flex-col">

        {/* Header - Simple & Clean */}
        <header className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <span className="bg-blue-600 text-white py-1.5 px-3 rounded-lg">AI</span>
              Subtitle Studio
            </h1>
          </div>
        </header>

        {/* Main Content: Responsive Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">

          {/* Column Left: Input Section (Smaller) */}
          <section className="lg:col-span-4 xl:col-span-3">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sticky top-8">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
                Audio Input
              </h2>

              <div className={`relative group border-2 border-dashed border-gray-200 rounded-xl p-6 transition-all text-center ${isUploading ? 'opacity-50 cursor-not-allowed' : 'hover:border-blue-400 hover:bg-blue-50/30 cursor-pointer'}`}>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
                  disabled={isUploading}
                  className={`absolute inset-0 w-full h-full opacity-0 ${isUploading ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                />
                <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2 group-hover:text-blue-500 transition-colors" />
                <p className="text-sm text-gray-600 font-medium">Choose file</p>
              </div>

              {file && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100 flex items-center justify-between">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <FileAudio className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="text-xs text-blue-900 truncate">{file.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const url = window.URL.createObjectURL(file);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = file.name;
                        a.click();
                        window.URL.revokeObjectURL(url);
                      }}
                      className="text-blue-500 hover:text-blue-700 transition-colors cursor-pointer"
                      title="Download Audio"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button onClick={() => setFile(null)} disabled={isUploading} className={`transition-colors ${isUploading ? 'text-gray-300 cursor-not-allowed' : 'text-gray-400 hover:text-red-500 cursor-pointer'}`}>
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Divider */}
              <div className="flex items-center gap-3 mt-5 mb-4">
                <div className="flex-1 h-px bg-gray-200"></div>
                <span className="text-xs text-gray-400 font-medium">or record</span>
                <div className="flex-1 h-px bg-gray-200"></div>
              </div>

              {/* Recording Controls */}
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  disabled={isUploading}
                  className="w-full py-3 rounded-xl font-semibold text-white shadow-sm transition-all flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Mic className="w-4 h-4" />
                  <span>Start Recording</span>
                </button>
              ) : (
                <div className="space-y-3">
                  {/* Recording indicator */}
                  <div className="flex items-center justify-center gap-2 py-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-recording-pulse"></span>
                    <span className="text-sm font-semibold text-red-600 font-tabular">
                      {isPaused ? 'Paused' : 'Recording'} — {formatTime(elapsed)}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {isPaused ? (
                      <button
                        onClick={resumeRecording}
                        className="flex-1 py-2.5 rounded-xl font-semibold text-white bg-amber-500 hover:bg-amber-600 transition-all flex items-center justify-center gap-1.5 text-sm cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        Resume
                      </button>
                    ) : (
                      <button
                        onClick={pauseRecording}
                        className="flex-1 py-2.5 rounded-xl font-semibold text-white bg-amber-500 hover:bg-amber-600 transition-all flex items-center justify-center gap-1.5 text-sm cursor-pointer"
                      >
                        <Pause className="w-3.5 h-3.5" />
                        Pause
                      </button>
                    )}
                    <button
                      onClick={stopRecording}
                      className="flex-1 py-2.5 rounded-xl font-semibold text-white bg-gray-700 hover:bg-gray-800 transition-all flex items-center justify-center gap-1.5 text-sm cursor-pointer"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                      Stop
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={handleTranscribe}
                disabled={!file || isUploading}
                className={`w-full mt-6 py-3 rounded-xl font-bold text-white shadow-sm transition-all flex items-center justify-center gap-2 ${(!file || isUploading) ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 cursor-pointer'
                  }`}
              >
                {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                <span>{isUploading ? 'Processing' : 'Start'}</span>
              </button>

            </div>
          </section>

          <section className="lg:col-span-8 xl:col-span-9 flex flex-col">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col min-h-[500px] lg:h-[calc(100vh-120px)]">

              {/* Toolbar */}
              <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${subtitle ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                  <h2 className="text-sm font-bold text-gray-700 uppercase tracking-tight">Subtitle Editor</h2>
                </div>

                {subtitle && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (subtitle && typeof navigator !== 'undefined' && navigator.clipboard) {
                          navigator.clipboard.writeText(subtitle);
                          alert("Clipboard Copied!");
                        } else {
                          alert("Cannot access Clipboard");
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copy
                    </button>
                    <button
                      onClick={downloadSRT}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100 rounded-lg transition-colors border border-green-200 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" /> Download .SRT
                    </button>
                  </div>
                )}
              </div>

              {/* Editor Area */}
              <div className="grow relative overflow-hidden flex flex-col bg-gray-50/30">
                {!subtitle && !isUploading && (
                  <div className="grow flex flex-col items-center justify-center text-gray-400">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                      <FileAudio className="w-8 h-8 opacity-20" />
                    </div>
                    <p className="text-sm italic">รอการประมวลผลไฟล์เสียงเพื่อแสดงผลลัพธ์...</p>
                  </div>
                )}

                {isUploading && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-[2px] flex flex-col items-center justify-center z-20 px-8">
                    <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
                    <p className="text-blue-700 font-semibold animate-pulse mb-6">{statusMsg || "AI Processing…"}</p>

                    <div className="w-full max-w-md bg-gray-200 rounded-full h-2.5 mb-2 overflow-hidden shadow-inner">
                      <div
                        className="bg-blue-600 h-2.5 rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                    <p className="text-sm text-gray-500 font-medium">{Math.round(progress)}%</p>
                  </div>
                )}

                {subtitle && (
                  <textarea
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    className="grow w-full p-8 bg-transparent text-gray-700 font-mono text-base leading-relaxed resize-none focus:outline-none scrollbar-thin scrollbar-thumb-gray-200"
                    placeholder="แก้ไขข้อความได้ที่นี่..."
                  />
                )}
              </div>

              {/* Footer Info */}
              <div className="px-6 py-3 border-t border-gray-100 bg-white rounded-b-2xl">
                <p className="text-[10px] text-gray-400 text-center tracking-widest">
                  SE for ML Sys by Wake Up Ma Quiz
                </p>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}