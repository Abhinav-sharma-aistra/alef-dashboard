import { Sidebar } from "@/components/sidebar";
import { Chatbox } from "@/components/chatbox";

export default function Home() {
  return (
    <div className="h-screen flex overflow-hidden">
      {/* Sidebar - 20% width */}
      <div className="w-[20%] border-r border-border overflow-hidden">
        <Sidebar />
      </div>

      {/* Main Content Area - 80% width */}
      <div className="w-[80%] overflow-hidden">
        <Chatbox />
      </div>
    </div>
  );
}
