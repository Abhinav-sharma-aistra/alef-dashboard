"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { MessageSquare, History, Home } from "lucide-react";

const menuItems = [
  { icon: Home, label: "Home", active: false },
  { icon: MessageSquare, label: "Chat", active: true },
  { icon: History, label: "History", active: false },
];

export function Sidebar() {
  return (
    <div
      className="h-full w-full flex flex-col overflow-hidden"
      style={{ backgroundColor: "#333f48" }}
    >
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-6 border-b border-gray-600">
        <div className="flex flex-col items-center">
          <div className="w-full h-16 rounded-lg overflow-hidden mb-4">
            <Image
              src="/alef.png"
              alt="Alef Logo"
              width={200}
              height={64}
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="font-semibold text-lg text-center text-gray-100">
            Alef Dashboard
          </h1>
        </div>
      </div>

      {/* Navigation Menu */}
      <div className="flex-1 px-4 py-6">
        <div className="space-y-2">
          {menuItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <Button
                key={index}
                variant={item.active ? "secondary" : "ghost"}
                className={`w-full justify-start gap-3 h-11 px-4 ${
                  item.active
                    ? "bg-gray-700 text-white hover:bg-gray-600"
                    : "text-gray-300 hover:bg-gray-700 hover:text-white"
                }`}
                size="sm"
              >
                <Icon className="w-4 h-4" />
                <span className="flex-1 text-left">{item.label}</span>
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
