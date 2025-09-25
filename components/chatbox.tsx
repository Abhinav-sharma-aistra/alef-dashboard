"use client";

import { useState, useRef, useEffect } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Send, Mic, Play, Download, CheckCircle } from "lucide-react";

type APIResponse = {
  sql_query?: string;
  results?: Array<Record<string, string | number>>;
  visualization?: string;
  visualization_reason?: string;
  formatted_data?: {
    image_base64?: string;
  };
  insights?: string;
};

type Message = {
  id: number;
  content: string;
  sender: "user" | "assistant";
  timestamp: string;
  isTyping?: boolean;
  apiData?: APIResponse;
  audioData?: {
    audioBlob: Blob;
    audioUrl: string;
    duration?: number;
  };
};

const sampleMessages: Message[] = [
  {
    id: 1,
    content:
      "Hello! I'm your AI assistant. I can help you analyze your business data and generate insights. Try asking me questions like:",
    sender: "assistant",
    timestamp: "10:30 AM",
  },
  {
    id: 2,
    content:
      'Here are some example questions you can ask:\n\n• "What\'s the sales in the last month?"\n• "Show me revenue trends"\n• "How is our performance this quarter?"\n• "What are the top selling products?"\n\nFeel free to ask any business-related question!',
    sender: "assistant",
    timestamp: "10:30 AM",
  },
];

export function Chatbox() {
  const [messages, setMessages] = useState<Message[]>(sampleMessages);
  const [newMessage, setNewMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [processingStage, setProcessingStage] = useState<string>("");
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [audioLevels, setAudioLevels] = useState<number[]>([
    2, 4, 3, 8, 6, 4, 7, 3, 5, 9, 2, 6,
  ]);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (
        audioContextRef.current &&
        audioContextRef.current.state !== "closed"
      ) {
        audioContextRef.current.close();
      }
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    };
  }, []);

  const queryAPI = async (question: string): Promise<APIResponse | null> => {
    let progressInterval: NodeJS.Timeout;
    let currentStage = 0;
    const stages = [
      "Establishing connection to data servers...",
      "Processing your request and analyzing context...",
      "Querying databases and generating insights...",
      "Finalizing results and preparing response...",
    ];

    try {
      // Start with first stage
      setLoadingProgress(10);
      setProcessingStage(stages[0]);

      // Update progress every 1.5 seconds
      progressInterval = setInterval(() => {
        setLoadingProgress((prev) => {
          if (prev < 90) {
            const increment = Math.random() * 15 + 5; // Random increment between 5-20%
            const newProgress = Math.min(prev + increment, 90);

            // Update stage based on progress
            if (newProgress >= 25 && currentStage === 0) {
              currentStage = 1;
              setProcessingStage(stages[1]);
            } else if (newProgress >= 50 && currentStage === 1) {
              currentStage = 2;
              setProcessingStage(stages[2]);
            } else if (newProgress >= 75 && currentStage === 2) {
              currentStage = 3;
              setProcessingStage(stages[3]);
            }

            return newProgress;
          }
          return prev;
        });
      }, 1500); // Update every 1.5 seconds

      const response = await axios.post(
        "/api/bi/query",
        {
          question: question,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          timeout: 30000,
        }
      );

      // Clear the interval and complete progress
      clearInterval(progressInterval);
      setLoadingProgress(100);
      setProcessingStage("✅ Complete!");

      return response.data;
    } catch (error) {
      // Clear interval on error
      if (progressInterval!) {
        clearInterval(progressInterval);
      }
      if (axios.isAxiosError(error)) {
        if (error.code === "ECONNABORTED") {
          console.error("Request timeout:", error);
        } else if (error.code === "ERR_NETWORK") {
          console.error(
            "Network error - check if the server is accessible:",
            error
          );
        } else if (error.response) {
          // Server responded with error status
          console.error(
            "Server error:",
            error.response.status,
            error.response.data
          );
        } else if (error.request) {
          // Request was made but no response received
          console.error("No response from server:", error.request);
        } else {
          console.error("Request setup error:", error.message);
        }
      } else {
        console.error("Non-axios error:", error);
      }
      return null;
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Setup audio context for visualization
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      // Start visualizing audio levels
      const updateAudioLevels = () => {
        if (analyserRef.current && isRecording) {
          const dataArray = new Uint8Array(
            analyserRef.current.frequencyBinCount
          );
          analyserRef.current.getByteFrequencyData(dataArray);

          // Create audio bars based on frequency data
          const levels = [];
          for (let i = 0; i < 12; i++) {
            const value = dataArray[i * 8] || 0;
            levels.push(Math.max(2, Math.floor((value / 255) * 20)));
          }
          setAudioLevels(levels);

          animationFrameRef.current = requestAnimationFrame(updateAudioLevels);
        }
      };

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      updateAudioLevels();

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error("Error starting recording:", error);
    }
  };
  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream
        .getTracks()
        .forEach((track) => track.stop());
      setIsRecording(false);

      // Clean up audio analysis
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/wav",
        });
        const audioUrl = URL.createObjectURL(audioBlob);

        // Send audio message
        await sendAudioMessage(audioBlob, audioUrl);
      };
    }
  };

  const sendAudioMessage = async (audioBlob: Blob, audioUrl: string) => {
    // Create audio message
    const audioMessage: Message = {
      id: messages.length + 1,
      content: "Voice message",
      sender: "user",
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      audioData: {
        audioBlob,
        audioUrl,
        duration: recordingTime,
      },
    };

    setMessages((prev) => [...prev, audioMessage]);
    setIsTyping(true);
    setLoadingProgress(0);
    setProcessingStage("🎙️ Transcribing audio...");

    try {
      // Transcribe audio using Whisper
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.wav");

      setLoadingProgress(20);
      setProcessingStage("🤖 Converting speech to text...");

      const transcriptionResponse = await axios.post("/api/whisper", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const transcribedText = transcriptionResponse.data.text;
      setLoadingProgress(40);
      setProcessingStage("📝 Understanding your message...");

      // Small delay to show the transcription stage
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Send transcribed text to analysis API
      const apiResponse = await queryAPI(transcribedText);

      let assistantContent = "";
      if (apiResponse) {
        assistantContent = `I heard: "${transcribedText}"\n\nI've analyzed your request and generated insights based on your question.`;
      } else {
        assistantContent = `I heard: "${transcribedText}"\n\nI'm sorry, I couldn't connect to the data server at the moment. Please try again.`;
      }

      // Stream the response text
      await streamResponse(assistantContent, apiResponse || undefined);
    } catch (error) {
      console.error("Error processing audio:", error);

      const errorMessage: Message = {
        id: messages.length + 2,
        content:
          "Sorry, I couldn't process your voice message. Please try again or type your message instead.",
        sender: "assistant",
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      setMessages((prev) => [...prev, errorMessage]);
    }

    setIsTyping(false);
    setProcessingStage("");
    setLoadingProgress(0);
    setRecordingTime(0);
  };

  const streamResponse = async (content: string, apiData?: APIResponse) => {
    const assistantMessage: Message = {
      id: messages.length + 2,
      content: "",
      sender: "assistant",
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      isTyping: true,
      apiData: apiData || undefined,
    };

    setMessages((prev) => [...prev, assistantMessage]);

    // Stream text character by character
    for (let i = 0; i <= content.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 30));
      const currentText = content.slice(0, i);

      setMessages((prev) =>
        prev.map((msg, index) =>
          index === prev.length - 1
            ? { ...msg, content: currentText, isTyping: i < content.length }
            : msg
        )
      );
    }
  };

  const handleMicClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const downloadChart = (base64Image: string, filename: string = "chart") => {
    try {
      // Create a link element
      const link = document.createElement("a");
      link.href = `data:image/png;base64,${base64Image}`;
      link.download = `${filename}-${new Date().getTime()}.png`;

      // Trigger the download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Error downloading chart:", error);
    }
  };

  const handleSendMessage = async () => {
    // If recording, stop recording instead of sending text
    if (isRecording) {
      stopRecording();
      return;
    }

    if (!newMessage.trim()) return;

    const userMessage: Message = {
      id: messages.length + 1,
      content: newMessage,
      sender: "user",
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    const currentQuestion = newMessage;
    setMessages((prev) => [...prev, userMessage]);
    setNewMessage("");
    setIsTyping(true);
    setLoadingProgress(0);
    setProcessingStage("🚀 Preparing your request...");

    // Query the API
    const apiResponse = await queryAPI(currentQuestion);

    let assistantContent = "";
    if (apiResponse) {
      assistantContent =
        "I've analyzed your data and generated insights based on your question.";
    } else {
      assistantContent =
        "I'm sorry, I couldn't connect to the data server at the moment. This could be due to:\n\n• Network connectivity issues\n• Server temporarily unavailable\n• Request timeout\n\nPlease check your internet connection and try again.";
    }

    const assistantMessage: Message = {
      id: messages.length + 2,
      content: assistantContent,
      sender: "assistant",
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      apiData: apiResponse || undefined,
    };

    setMessages((prev) => [...prev, assistantMessage]);
    setIsTyping(false);
    setLoadingProgress(0);
    setProcessingStage("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-50">
      <style jsx>{`
        @keyframes slideRight {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(400%);
          }
        }
      `}</style>

      {/* Messages Area */}
      <ScrollArea className="flex-1 min-h-0 p-6" ref={scrollAreaRef}>
        <div className="space-y-6">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-4 ${
                message.sender === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {message.sender === "assistant" && (
                <Avatar className="h-10 w-10 mt-1 ring-2 ring-gray-100 shadow-sm">
                  <AvatarImage src="/ai_avatar.jpg" />
                  <AvatarFallback
                    style={{ backgroundColor: "#b6735c", color: "white" }}
                  >
                    AI
                  </AvatarFallback>
                </Avatar>
              )}

              <div
                className={`max-w-[75%] ${
                  message.sender === "user" ? "order-1" : ""
                }`}
              >
                <Card
                  className="p-4 shadow-sm border-0"
                  style={{
                    backgroundColor:
                      message.sender === "user" ? "#333f48" : "white",
                    color: message.sender === "user" ? "white" : "#333f48",
                  }}
                >
                  <p className="text-base leading-relaxed whitespace-pre-wrap">
                    {message.content}
                  </p>

                  {/* Audio Player for voice messages */}
                  {message.audioData && (
                    <div
                      className="mt-3 p-3 rounded-lg border"
                      style={{
                        backgroundColor:
                          message.sender === "user"
                            ? "rgba(255,255,255,0.1)"
                            : "#f8f9fa",
                        borderColor:
                          message.sender === "user"
                            ? "rgba(255,255,255,0.2)"
                            : "#e9ecef",
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="p-2 hover:bg-white/20"
                          style={{
                            color:
                              message.sender === "user" ? "white" : "#333f48",
                          }}
                          onClick={() => {
                            const audio = new Audio(
                              message.audioData!.audioUrl
                            );
                            audio.play();
                          }}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                        <div className="flex-1">
                          <div
                            className="text-xs"
                            style={{
                              color:
                                message.sender === "user"
                                  ? "rgba(255,255,255,0.8)"
                                  : "#898d8d",
                            }}
                          >
                            Voice message • {message.audioData.duration || 0}s
                          </div>
                          <div
                            className="w-full rounded-full h-2 mt-1"
                            style={{
                              backgroundColor:
                                message.sender === "user"
                                  ? "rgba(255,255,255,0.2)"
                                  : "#e9ecef",
                            }}
                          >
                            <div
                              className="h-2 rounded-full w-1/3"
                              style={{ backgroundColor: "#b6735c" }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* API Data Display */}
                  {message.sender === "assistant" && message.apiData && (
                    <div className="mt-4 space-y-4">
                      {/* Chart/Visualization */}
                      {message.apiData.formatted_data?.image_base64 && (
                        <div className="border rounded-lg overflow-hidden relative group">
                          {/* Download Button */}
                          <Button
                            size="sm"
                            className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-lg hover:shadow-xl"
                            style={{
                              backgroundColor: "#b6735c",
                              color: "white",
                            }}
                            onClick={() =>
                              downloadChart(
                                message.apiData!.formatted_data!.image_base64!,
                                "data-visualization"
                              )
                            }
                          >
                            <Download className="h-4 w-4 mr-1" />
                            Download
                          </Button>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`data:image/png;base64,${message.apiData.formatted_data.image_base64}`}
                            alt="Data Visualization"
                            className="w-full h-auto"
                          />
                        </div>
                      )}

                      {/* Data Results */}
                      {message.apiData.results &&
                        message.apiData.results.length > 0 && (
                          <div className="bg-background/50 rounded-lg p-3">
                            <h4 className="font-medium text-sm mb-2">
                              Data Results:
                            </h4>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b">
                                    {Object.keys(
                                      message.apiData.results[0]
                                    ).map((key) => (
                                      <th
                                        key={key}
                                        className="text-left p-1 font-medium"
                                      >
                                        {key
                                          .replace(/_/g, " ")
                                          .replace(/\b\w/g, (l) =>
                                            l.toUpperCase()
                                          )}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {message.apiData.results.map((row, index) => (
                                    <tr
                                      key={index}
                                      className="border-b border-gray-100"
                                    >
                                      {Object.values(row).map(
                                        (value, cellIndex) => (
                                          <td key={cellIndex} className="p-1">
                                            {typeof value === "number" &&
                                            value > 1000
                                              ? value.toLocaleString()
                                              : String(value)}
                                          </td>
                                        )
                                      )}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                      {/* Insights */}
                      {message.apiData.insights && (
                        <div
                          className="rounded-lg p-4 border shadow-sm"
                          style={{
                            backgroundColor: "#f8f9fa",
                            borderColor: "#b6735c",
                          }}
                        >
                          <h4
                            className="font-semibold text-sm mb-3 flex items-center gap-2"
                            style={{ color: "#333F48" }}
                          >
                            💡 Insights
                          </h4>
                          <div
                            className="text-sm prose prose-sm max-w-none"
                            style={{ color: "#555" }}
                          >
                            <ReactMarkdown
                              components={{
                                h1: (props) => (
                                  <h1
                                    className="text-lg font-bold mb-2"
                                    style={{ color: "#333F48" }}
                                    {...props}
                                  />
                                ),
                                h2: (props) => (
                                  <h2
                                    className="text-base font-bold mb-2"
                                    style={{ color: "#333F48" }}
                                    {...props}
                                  />
                                ),
                                h3: (props) => (
                                  <h3
                                    className="text-sm font-bold mb-1"
                                    style={{ color: "#333F48" }}
                                    {...props}
                                  />
                                ),
                                p: (props) => (
                                  <p
                                    className="mb-2 leading-relaxed"
                                    {...props}
                                  />
                                ),
                                ul: (props) => (
                                  <ul
                                    className="list-disc pl-5 mb-2"
                                    {...props}
                                  />
                                ),
                                ol: (props) => (
                                  <ol
                                    className="list-decimal pl-5 mb-2"
                                    {...props}
                                  />
                                ),
                                li: (props) => (
                                  <li className="mb-1" {...props} />
                                ),
                                strong: (props) => (
                                  <strong
                                    className="font-bold"
                                    style={{ color: "#333F48" }}
                                    {...props}
                                  />
                                ),
                                em: (props) => (
                                  <em className="italic" {...props} />
                                ),
                                code: (props) => (
                                  <code
                                    className="px-1 py-0.5 rounded text-xs font-mono"
                                    style={{
                                      backgroundColor: "#e9ecef",
                                      color: "#333F48",
                                    }}
                                    {...props}
                                  />
                                ),
                                blockquote: (props) => (
                                  <blockquote
                                    className="border-l-4 pl-3 py-1 my-2"
                                    style={{
                                      borderColor: "#b6735c",
                                      backgroundColor:
                                        "rgba(182, 115, 92, 0.1)",
                                    }}
                                    {...props}
                                  />
                                ),
                              }}
                            >
                              {message.apiData.insights}
                            </ReactMarkdown>
                          </div>
                        </div>
                      )}

                      {/* SQL Query (Optional - for debugging) */}
                      {message.apiData.sql_query && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                            View SQL Query
                          </summary>
                          <code className="block mt-1 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
                            {message.apiData.sql_query}
                          </code>
                        </details>
                      )}
                    </div>
                  )}
                </Card>
                <p
                  className={`text-sm mt-2 ${
                    message.sender === "user" ? "text-right" : "text-left"
                  }`}
                  style={{ color: "#898d8d" }}
                >
                  {message.timestamp}
                </p>
              </div>

              {message.sender === "user" && (
                <Avatar className="h-10 w-10 mt-1 ring-2 ring-gray-100 shadow-sm">
                  <AvatarImage src="/user_avatar.jpg" />
                  <AvatarFallback
                    style={{ backgroundColor: "#333f48", color: "white" }}
                  >
                    U
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}

          {/* Recording Indicator */}
          {isRecording && (
            <div className="flex gap-4">
              <Avatar className="h-10 w-10 mt-1 ring-2 ring-red-200 shadow-sm">
                <AvatarImage src="/user_avatar.jpg" />
                <AvatarFallback
                  style={{ backgroundColor: "#333f48", color: "white" }}
                >
                  U
                </AvatarFallback>
              </Avatar>
              <Card
                className="p-4 shadow-sm border-0"
                style={{ backgroundColor: "#fff5f5", borderColor: "#fed7d7" }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    {audioLevels.map((level, index) => (
                      <div
                        key={index}
                        className="w-1 bg-red-500 rounded-full transition-all duration-150"
                        style={{
                          height: `${level}px`,
                          opacity: 0.7 + level / 40,
                          animationDelay: `${index * 50}ms`,
                        }}
                      />
                    ))}
                  </div>
                  <div className="flex flex-col">
                    <span
                      className="text-base font-medium"
                      style={{ color: "#333f48" }}
                    >
                      Recording...
                    </span>
                    <span className="text-sm opacity-70">
                      {Math.floor(recordingTime / 60)}:
                      {(recordingTime % 60).toString().padStart(2, "0")}
                    </span>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* Simplified Typing Indicator */}
          {isTyping && (
            <div className="flex gap-4">
              <Avatar className="h-10 w-10 mt-1 ring-2 ring-blue-200 shadow-lg animate-pulse">
                <AvatarImage src="/ai_avatar.jpg" />
                <AvatarFallback
                  style={{ backgroundColor: "#b6735c", color: "white" }}
                >
                  AI
                </AvatarFallback>
              </Avatar>
              <Card
                className="p-4 shadow-lg border-0 min-w-[300px] relative overflow-hidden"
                style={{
                  backgroundColor: "white",
                  borderLeft: "4px solid #b6735c",
                }}
              >
                {/* Animated background gradient */}
                <div className="absolute inset-0 bg-gradient-to-r from-blue-50 via-purple-50 to-pink-50 opacity-30 animate-pulse"></div>

                <div className="relative z-10 space-y-3">
                  {/* Main status text */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-800">
                      {processingStage || "Processing your request..."}
                    </span>
                    {loadingProgress === 100 && (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    )}
                  </div>

                  {/* Slim Progress Bar */}
                  <div className="space-y-2">
                    <div className="w-full bg-gray-200 rounded-full h-1 overflow-hidden shadow-inner">
                      <div
                        className="h-1 rounded-full transition-all duration-500 ease-out relative overflow-hidden"
                        style={{
                          width: `${loadingProgress}%`,
                          backgroundColor:
                            loadingProgress === 100 ? "#10b981" : "#b6735c",
                        }}
                      >
                        {/* Moving highlight */}
                        {loadingProgress < 100 && (
                          <div
                            className="absolute top-0 left-0 h-full w-6 opacity-60 animate-pulse"
                            style={{
                              background:
                                "linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)",
                            }}
                          />
                        )}
                      </div>
                    </div>

                    {/* 4 Main progress indicators */}
                    <div className="flex justify-between text-xs text-gray-400">
                      <span
                        className={
                          loadingProgress >= 25
                            ? "text-blue-500 font-medium"
                            : ""
                        }
                      >
                        Processing
                      </span>
                      <span
                        className={
                          loadingProgress >= 50
                            ? "text-blue-500 font-medium"
                            : ""
                        }
                      >
                        Analyzing
                      </span>
                      <span
                        className={
                          loadingProgress >= 75
                            ? "text-blue-500 font-medium"
                            : ""
                        }
                      >
                        Generating
                      </span>
                      <span
                        className={
                          loadingProgress >= 100
                            ? "text-green-500 font-medium"
                            : ""
                        }
                      >
                        Complete
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Message Input */}
      <div
        className="flex-shrink-0 p-6 border-t"
        style={{ backgroundColor: "white", borderColor: "#e9ecef" }}
      >
        {/* Quick Questions */}
        <div className="mb-4 flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs border-2 hover:bg-gray-50"
            style={{ borderColor: "#b6735c", color: "#b6735c" }}
            onClick={() => setNewMessage("What's the sales in the last month?")}
          >
            Sales Last Month
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs border-2 hover:bg-gray-50"
            style={{ borderColor: "#b6735c", color: "#b6735c" }}
            onClick={() => setNewMessage("Show me revenue trends")}
          >
            Revenue Trends
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs border-2 hover:bg-gray-50"
            style={{ borderColor: "#b6735c", color: "#b6735c" }}
            onClick={() =>
              setNewMessage("How is our performance this quarter?")
            }
          >
            Quarter Performance
          </Button>
        </div>

        <div className="flex gap-2">
          <div className="flex-1 relative">
            {isRecording ? (
              // Enhanced Recording Animation with real-time audio levels
              <div className="flex items-center h-10 px-3 border-2 border-red-300 bg-red-50 rounded-md animate-pulse">
                <div className="flex items-center gap-3 text-red-600">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-ping"></div>
                  <span className="text-sm font-medium">Recording...</span>
                  <div className="flex items-center gap-1 ml-2">
                    {audioLevels.map((level, index) => (
                      <div
                        key={index}
                        className="w-1 bg-red-500 rounded-full transition-all duration-100"
                        style={{
                          height: `${Math.max(4, level)}px`,
                          opacity: 0.6 + level / 40,
                        }}
                      />
                    ))}
                  </div>
                  <span className="text-xs ml-2 font-mono">
                    {Math.floor(recordingTime / 60)}:
                    {(recordingTime % 60).toString().padStart(2, "0")}
                  </span>
                </div>
              </div>
            ) : (
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message..."
                className="pr-12"
              />
            )}
            <Button
              variant="ghost"
              size="sm"
              className={`absolute right-1 top-1/2 -translate-y-1/2 p-2 transition-all duration-200 ${
                isRecording
                  ? "bg-red-100 hover:bg-red-200 text-red-600 animate-pulse"
                  : "hover:bg-gray-100 text-gray-500 hover:text-gray-700"
              }`}
              onClick={handleMicClick}
              title={isRecording ? "Stop recording" : "Start recording"}
            >
              {isRecording ? (
                <div className="relative">
                  <div className="w-4 h-4 bg-red-500 rounded-sm"></div>
                  <div className="absolute inset-0 w-4 h-4 border-2 border-red-500 rounded-full animate-ping"></div>
                </div>
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>
          </div>
          <Button
            onClick={handleSendMessage}
            size="sm"
            className={`p-3 shrink-0 hover:opacity-90 transition-all duration-200 ${
              isRecording ? "bg-red-500 hover:bg-red-600" : ""
            }`}
            style={{
              backgroundColor: isRecording ? "#ef4444" : "#333f48",
              color: "white",
            }}
            disabled={!newMessage.trim() && !isRecording}
            title={isRecording ? "Stop and send" : "Send message"}
          >
            {isRecording ? (
              <div className="w-4 h-4 bg-white rounded-sm"></div>
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
