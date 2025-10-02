"use client";

import { useState, useRef, useEffect } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Send,
  Mic,
  Play,
  Download,
  CheckCircle,
  Volume2,
  Pause,
} from "lucide-react";

type APIResponse = {
  sql_query?: string;
  results?: Array<Record<string, string | number>>;
  visualization?: string;
  visualization_reason?: string;
  formatted_data?: {
    image_base64?: string;
  };
  insights?: string;
  preGeneratedAudioUrl?: string;
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

  // TTS state
  const isTTSEnabled = true; // Always enabled since controls are in insights
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(
    null
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSpeakingMessageId, setCurrentSpeakingMessageId] = useState<
    number | null
  >(null);
  const [ttsTextParts, setTtsTextParts] = useState<{
    [messageId: number]: {
      currentPart: number;
      parts: string[];
      fullText: string;
    };
  }>({});

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
      // Cleanup TTS audio
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.src = "";
      }
    };
  }, [currentAudio]);

  // TTS Functionality

  const speakText = async (text: string, messageId?: number) => {
    if (!isTTSEnabled) return;

    try {
      // Stop any currently playing audio
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.src = "";
      }

      // Set loading state immediately
      setIsPlaying(true);
      setCurrentSpeakingMessageId(messageId || null);

      // Clean markdown formatting for better TTS
      const cleanedText = cleanMarkdownForTTS(text);

      const response = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: cleanedText }),
      });

      if (!response.ok) {
        throw new Error("TTS request failed");
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio();

      // Set audio properties for faster playback
      audio.preload = "auto";
      audio.volume = 0.8;

      setCurrentAudio(audio);

      // Setup event handlers before setting src
      audio.oncanplaythrough = () => {
        // Audio is ready, play immediately
        audio.play().catch(console.error);
      };

      audio.onended = () => {
        setIsPlaying(false);
        setCurrentAudio(null);
        setCurrentSpeakingMessageId(null);
        URL.revokeObjectURL(audioUrl);
      };

      audio.onerror = () => {
        setIsPlaying(false);
        setCurrentAudio(null);
        setCurrentSpeakingMessageId(null);
        URL.revokeObjectURL(audioUrl);
      };

      // Set src last to trigger loading
      audio.src = audioUrl;
    } catch (error) {
      console.error("TTS Error:", error);
      setIsPlaying(false);
      setCurrentAudio(null);
      setCurrentSpeakingMessageId(null);
    }
  };

  // Line-by-line TTS function - one line at a time
  const speakTextChunked = async (
    text: string,
    messageId?: number,
    startFromPart: number = 0
  ) => {
    if (!isTTSEnabled) return;

    try {
      // Stop any currently playing audio
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.src = "";
      }

      // Set loading state immediately
      setIsPlaying(true);
      setCurrentSpeakingMessageId(messageId || null);

      // Clean markdown formatting for better TTS
      const cleanedText = cleanMarkdownForTTS(text);

      // Split text into individual lines, filtering out empty lines
      const lines = cleanedText
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      // If no lines found, split by sentences as fallback
      if (lines.length === 0 || lines.length === 1) {
        const sentences = cleanedText
          .split(/[.!?]+/)
          .filter((s) => s.trim().length > 10);
        if (sentences.length > 1) {
          lines.length = 0;
          lines.push(...sentences.map((s) => s.trim() + "."));
        }
      }

      // Store the lines for this message
      if (messageId) {
        setTtsTextParts((prev) => ({
          ...prev,
          [messageId]: {
            currentPart: startFromPart,
            parts: lines,
            fullText: cleanedText,
          },
        }));
      }

      // Get the current line to speak
      const lineToSpeak = lines[startFromPart] || cleanedText;

      console.log(
        `Speaking line ${startFromPart + 1}/${lines.length}:`,
        lineToSpeak
      );

      const response = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: lineToSpeak }),
      });

      if (!response.ok) {
        throw new Error("TTS request failed");
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio();

      // Set audio properties for faster playback
      audio.preload = "auto";
      audio.volume = 0.8;

      setCurrentAudio(audio);

      // Setup event handlers before setting src
      audio.oncanplaythrough = () => {
        // Audio is ready, play immediately
        audio.play().catch(console.error);
      };

      audio.onended = () => {
        console.log(`Line ${startFromPart + 1}/${lines.length} completed`);
        setIsPlaying(false);
        setCurrentAudio(null);
        setCurrentSpeakingMessageId(null);
        URL.revokeObjectURL(audioUrl);
      };

      audio.onerror = () => {
        console.error("Audio playback error for line:", lineToSpeak);
        setIsPlaying(false);
        setCurrentAudio(null);
        setCurrentSpeakingMessageId(null);
        URL.revokeObjectURL(audioUrl);
      };

      // Set src last to trigger loading
      audio.src = audioUrl;
    } catch (error) {
      console.error("Line-by-line TTS Error:", error);
      setIsPlaying(false);
      setCurrentAudio(null);
      setCurrentSpeakingMessageId(null);
    }
  };

  // Continue TTS for remaining parts
  const continueTTS = (messageId: number) => {
    const ttsData = ttsTextParts[messageId];
    if (ttsData && ttsData.currentPart + 1 < ttsData.parts.length) {
      const nextPart = ttsData.currentPart + 1;
      speakTextChunked(ttsData.fullText, messageId, nextPart);
    }
  };
  const stopTTS = () => {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = "";
      setCurrentAudio(null);
    }
    setIsPlaying(false);
    setCurrentSpeakingMessageId(null);
  };

  // Function to play pre-generated audio
  const playPreGeneratedAudio = (audioUrl: string, messageId?: number) => {
    try {
      // Stop any currently playing audio
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.src = "";
      }

      const audio = new Audio(audioUrl);
      audio.volume = 0.8;
      audio.preload = "auto";

      setCurrentAudio(audio);
      setIsPlaying(true);
      setCurrentSpeakingMessageId(messageId || null);

      audio.onended = () => {
        setIsPlaying(false);
        setCurrentAudio(null);
        setCurrentSpeakingMessageId(null);
        URL.revokeObjectURL(audioUrl);
      };

      audio.onerror = () => {
        console.error("Error playing pre-generated audio");
        setIsPlaying(false);
        setCurrentAudio(null);
        setCurrentSpeakingMessageId(null);
        URL.revokeObjectURL(audioUrl);
      };

      audio.play().catch(console.error);
    } catch (error) {
      console.error("Error in playPreGeneratedAudio:", error);
    }
  };

  // Function to clean markdown formatting for TTS
  const cleanMarkdownForTTS = (text: string): string => {
    return (
      text
        // Remove markdown headers
        .replace(/#{1,6}\s+/g, "")
        // Remove markdown bold/italic
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1")
        .replace(/__([^_]+)__/g, "$1")
        .replace(/_([^_]+)_/g, "$1")
        // Remove markdown links [text](url)
        .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
        // Remove markdown code blocks
        .replace(/```[^`]*```/g, "")
        .replace(/`([^`]+)`/g, "$1")
        // Remove markdown lists
        .replace(/^\s*[-*+]\s+/gm, "")
        .replace(/^\s*\d+\.\s+/gm, "")
        // Remove blockquotes
        .replace(/^\s*>\s+/gm, "")
        // Remove extra whitespace and newlines
        .replace(/\n{2,}/g, ". ")
        .replace(/\n/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim()
    );
  };

  // Helper function to build conversation history as text string
  const buildConversationHistory = (): string => {
    return messages
      .filter((msg) => !msg.audioData) // Exclude voice messages for now
      .map((msg) => {
        if (msg.sender === "user") {
          return `User: ${msg.content}`;
        } else {
          // For assistant messages, include main content but exclude image data
          let content = msg.content;

          // Add insights if available (but no images)
          if (msg.apiData?.insights) {
            content += `\n\nInsights: ${msg.apiData.insights}`;
          }

          // Add data results summary if available
          if (msg.apiData?.results && msg.apiData.results.length > 0) {
            const resultSummary = `Data returned ${msg.apiData.results.length} records`;
            content += `\n\nData: ${resultSummary}`;
          }

          return `Assistant: ${content}`;
        }
      })
      .join("\n\n");
  };

  const queryAPI = async (question: string): Promise<APIResponse | null> => {
    let progressInterval: NodeJS.Timeout;
    let speechInterval: NodeJS.Timeout;
    let currentStage = 0;
    const stages = [
      "Establishing connection to data servers...",
      "Processing your request and analyzing context...",
      "Querying databases and generating insights...",
      "Finalizing results and preparing response...",
    ];

    const detailedSteps = [
      "Starting to process your request",
      "Connecting to the data warehouse",
      "Analyzing your question and context",
      "Running database queries",
      "Processing the retrieved data",
      "Applying business intelligence algorithms",
      "Generating comprehensive insights",
      "Formatting the results for you",
      "Almost finished with the analysis",
    ];

    let currentStepIndex = 0;

    try {
      // Start with first stage
      setLoadingProgress(10);
      setProcessingStage(stages[0]);

      // Speak the first step immediately
      if (isTTSEnabled) {
        speakText(detailedSteps[0]);
      }

      // Speak detailed steps every 3 seconds
      speechInterval = setInterval(() => {
        if (isTTSEnabled && currentStepIndex < detailedSteps.length - 1) {
          currentStepIndex++;
          speakText(detailedSteps[currentStepIndex]);
        }
      }, 3000);

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

      const conversationHistory = buildConversationHistory();

      const response = await axios.post(
        "/api/bi/query",
        {
          question: question,
          conversation_history: conversationHistory,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        }
      );

      // Clear the intervals but keep progress at 95% to maintain processing illusion
      clearInterval(progressInterval);
      clearInterval(speechInterval);
      setLoadingProgress(95);
      setProcessingStage("🎯 Finalizing insights and preparing audio...");

      // Stop any ongoing TTS but don't announce completion
      if (isTTSEnabled) {
        stopTTS();
      }

      // Pre-generate TTS for insights during the 2-second delay
      let preGeneratedAudioUrl = null;
      if (response.data?.insights && isTTSEnabled) {
        try {
          console.log("Pre-generating TTS for insights...");
          const cleanedInsights = cleanMarkdownForTTS(response.data.insights);

          const ttsResponse = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: cleanedInsights }),
          });

          if (ttsResponse.ok) {
            const audioBlob = await ttsResponse.blob();
            preGeneratedAudioUrl = URL.createObjectURL(audioBlob);
            console.log("TTS pre-generation completed");
          }
        } catch (error) {
          console.error("Error pre-generating TTS:", error);
        }
      }

      // Store the pre-generated audio URL for later use
      response.data.preGeneratedAudioUrl = preGeneratedAudioUrl;

      return response.data;
    } catch (error) {
      // Clear intervals on error
      if (progressInterval!) {
        clearInterval(progressInterval);
      }
      if (speechInterval!) {
        clearInterval(speechInterval);
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
      const assistantMessageId = messages.length + 2;
      await streamResponse(assistantContent, apiResponse || undefined);

      // Keep loader visible for 2 more seconds while TTS is being prepared
      // Show finalizing stage during the delay
      setProcessingStage("🎵 Generating audio and finalizing response...");
      setLoadingProgress(97); // Keep progressing slowly to show ongoing work

      setTimeout(() => {
        setIsTyping(false);
        setProcessingStage("");
        setLoadingProgress(0);
        setRecordingTime(0);

        // Play pre-generated audio if available
        if (apiResponse?.preGeneratedAudioUrl) {
          setTimeout(() => {
            playPreGeneratedAudio(
              apiResponse.preGeneratedAudioUrl!,
              assistantMessageId
            );
          }, 500); // Small delay before starting audio
        }
      }, 2000); // 2-second delay
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

      // Handle loader state for error case
      setIsTyping(false);
      setProcessingStage("");
      setLoadingProgress(0);
      setRecordingTime(0);
    }
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

    const messageId = assistantMessage.id;

    setMessages((prev) => [...prev, assistantMessage]);

    // Keep loader visible for 2 more seconds while TTS is being prepared
    // Show finalizing stage during the delay
    setProcessingStage("🎵 Generating audio and finalizing response...");
    setLoadingProgress(97); // Keep progressing slowly to show ongoing work

    setTimeout(() => {
      setIsTyping(false);
      setLoadingProgress(0);
      setProcessingStage("");

      // Play pre-generated audio if available
      if (apiResponse?.preGeneratedAudioUrl) {
        setTimeout(() => {
          playPreGeneratedAudio(apiResponse.preGeneratedAudioUrl!, messageId);
        }, 500); // Small delay before starting audio
      }
    }, 2000); // 2-second delay
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
                          <div
                            className="font-semibold text-sm mb-3 flex items-center justify-between"
                            style={{ color: "#333F48" }}
                          >
                            <div className="flex items-center gap-2">
                              💡 Insights
                            </div>

                            {/* TTS Controls for this insights section */}
                            <div className="flex items-center gap-2">
                              {currentSpeakingMessageId === message.id &&
                              isPlaying ? (
                                <div className="flex items-center gap-2">
                                  <div className="flex items-center gap-1">
                                    <div className="w-1 h-3 bg-blue-500 rounded animate-pulse"></div>
                                    <div
                                      className="w-1 h-4 bg-blue-500 rounded animate-pulse"
                                      style={{ animationDelay: "0.1s" }}
                                    ></div>
                                    <div
                                      className="w-1 h-3 bg-blue-500 rounded animate-pulse"
                                      style={{ animationDelay: "0.2s" }}
                                    ></div>
                                  </div>
                                  <span className="text-xs text-blue-600 animate-pulse">
                                    Speaking...
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="p-1 h-6 w-6 text-red-500 hover:text-red-700 hover:bg-red-50"
                                    onClick={stopTTS}
                                    title="Stop speaking"
                                  >
                                    <Pause className="h-3 w-3" />
                                  </Button>
                                </div>
                              ) : (
                                isTTSEnabled && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="p-1 h-6 w-6 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                                    onClick={() =>
                                      message.apiData?.insights &&
                                      speakTextChunked(
                                        message.apiData.insights,
                                        message.id
                                      )
                                    }
                                    title="Listen to insights"
                                  >
                                    <Volume2 className="h-3 w-3" />
                                  </Button>
                                )
                              )}
                            </div>
                          </div>
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

                            {/* Continue TTS Button */}
                            {ttsTextParts[message.id] &&
                              ttsTextParts[message.id].currentPart + 1 <
                                ttsTextParts[message.id].parts.length && (
                                <div className="mt-3 pt-3 border-t border-gray-200">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200"
                                    onClick={() => continueTTS(message.id)}
                                    disabled={
                                      isPlaying &&
                                      currentSpeakingMessageId === message.id
                                    }
                                  >
                                    <Volume2 className="h-3 w-3 mr-1" />
                                    Continue Reading Line{" "}
                                    {ttsTextParts[message.id].currentPart +
                                      2} /{" "}
                                    {ttsTextParts[message.id].parts.length}
                                  </Button>
                                </div>
                              )}
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
                            ? "text-blue-500 font-medium"
                            : ""
                        }
                      >
                        Preparing
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
                className="pr-12 h-10"
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
            className={`h-10 px-4 shrink-0 hover:opacity-90 transition-all duration-200 ${
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

        {/* Powered by section */}
        <div className="flex items-center justify-center gap-2 mt-3 text-xs text-gray-500">
          <span>powered by</span>
          <Image
            src="/aistra_logo.svg"
            alt="Aistra AI"
            width={16}
            height={16}
            className="h-4 w-auto"
          />
        </div>
      </div>
    </div>
  );
}
