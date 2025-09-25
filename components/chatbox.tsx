"use client";

import { useState, useRef, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Send, Mic, MoreVertical } from "lucide-react";

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
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const queryAPI = async (question: string): Promise<APIResponse | null> => {
    try {
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
          timeout: 30000, // 30 second timeout
        }
      );

      return response.data;
    } catch (error) {
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

  const handleSendMessage = async () => {
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
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Chat Header */}
      <div className="flex-shrink-0 border-b border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src="/api/placeholder/40/40" />
              <AvatarFallback>AI</AvatarFallback>
            </Avatar>
            <div>
              <h2 className="font-semibold">AI Assistant</h2>
              <p className="text-sm text-muted-foreground">
                Online • Always ready to help
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="p-2">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 min-h-0 p-4" ref={scrollAreaRef}>
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${
                message.sender === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {message.sender === "assistant" && (
                <Avatar className="h-8 w-8 mt-1">
                  <AvatarImage src="/api/placeholder/32/32" />
                  <AvatarFallback>AI</AvatarFallback>
                </Avatar>
              )}

              <div
                className={`max-w-[80%] ${
                  message.sender === "user" ? "order-1" : ""
                }`}
              >
                <Card
                  className={`p-3 ${
                    message.sender === "user"
                      ? "bg-primary text-primary-foreground ml-auto"
                      : "bg-muted"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">
                    {message.content}
                  </p>

                  {/* API Data Display */}
                  {message.sender === "assistant" && message.apiData && (
                    <div className="mt-4 space-y-4">
                      {/* Chart/Visualization */}
                      {message.apiData.formatted_data?.image_base64 && (
                        <div className="border rounded-lg overflow-hidden">
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
                        <div className="bg-blue-50/50 rounded-lg p-3 border border-blue-200/50">
                          <h4 className="font-medium text-sm mb-2 text-blue-900">
                            💡 Insights:
                          </h4>
                          <p className="text-xs text-blue-800 whitespace-pre-wrap">
                            {message.apiData.insights}
                          </p>
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
                  className={`text-xs text-muted-foreground mt-1 ${
                    message.sender === "user" ? "text-right" : "text-left"
                  }`}
                >
                  {message.timestamp}
                </p>
              </div>

              {message.sender === "user" && (
                <Avatar className="h-8 w-8 mt-1">
                  <AvatarImage src="/api/placeholder/32/32" />
                  <AvatarFallback>U</AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}

          {/* Typing Indicator */}
          {isTyping && (
            <div className="flex gap-3">
              <Avatar className="h-8 w-8 mt-1">
                <AvatarImage src="/api/placeholder/32/32" />
                <AvatarFallback>AI</AvatarFallback>
              </Avatar>
              <Card className="p-3 bg-muted">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" />
                  <div
                    className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"
                    style={{ animationDelay: "0.1s" }}
                  />
                  <div
                    className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"
                    style={{ animationDelay: "0.2s" }}
                  />
                </div>
              </Card>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Message Input */}
      <div className="flex-shrink-0 border-t border-border p-4">
        {/* Quick Questions */}
        <div className="mb-3 flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => setNewMessage("What's the sales in the last month?")}
          >
            Sales Last Month
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => setNewMessage("Show me revenue trends")}
          >
            Revenue Trends
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() =>
              setNewMessage("How is our performance this quarter?")
            }
          >
            Quarter Performance
          </Button>
        </div>

        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              className="pr-12"
            />
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 p-2"
            >
              <Mic className="h-4 w-4" />
            </Button>
          </div>
          <Button
            onClick={handleSendMessage}
            size="sm"
            className="p-2 shrink-0"
            disabled={!newMessage.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Press Enter to send, Shift + Enter for new line
        </p>
      </div>
    </div>
  );
}
