# Alef Dashboard

A modern dashboard application built with Next.js, TypeScript, and shadcn/ui components featuring a sidebar layout and chat interface.

## Features

### Sidebar (30% width)

- **Navigation Menu**: Home, Chat, History, Search, Notifications with badges, and Settings
- **Recent Chats**: Scrollable list of previous conversations with timestamps
- **New Chat**: Quick action button to start new conversations
- **User Profile**: User information and help access

### Chat Interface (70% width)

- **Modern Chat UI**: Clean, responsive chat interface with message bubbles
- **Sample Conversations**: Pre-populated with back-and-forth messages demonstrating product launch strategy discussion
- **Typing Indicators**: Animated typing indicator when the assistant is responding
- **Message Input**: Full-featured input with file attachment, voice message, and send capabilities
- **Auto-scroll**: Automatic scrolling to new messages

## Tech Stack

- **Next.js 15**: React framework with Turbopack
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first styling
- **shadcn/ui**: Modern UI component library
- **Lucide React**: Beautiful icons

## shadcn/ui Components Used

- `Button` - Interactive buttons throughout the interface
- `Card` - Message bubbles and chat items
- `Input` - Message input field
- `ScrollArea` - Scrollable content areas
- `Avatar` - User and assistant avatars
- `Badge` - Notification badges
- `Separator` - Visual separators

## Getting Started

```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to view the dashboard.

## Layout Structure

```
┌─────────────────────────────────────────────────┐
│                                                 │
│  ┌─────────────┐  │  ┌─────────────────────────┐ │
│  │             │  │  │                         │ │
│  │   Sidebar   │  │  │      Chat Interface     │ │
│  │    (30%)    │  │  │         (70%)           │ │
│  │             │  │  │                         │ │
│  │ - Navigation│  │  │ - Chat Header           │ │
│  │ - New Chat  │  │  │ - Messages Area         │ │
│  │ - Recent    │  │  │ - Message Input         │ │
│  │   Chats     │  │  │                         │ │
│  │ - User Info │  │  │                         │ │
│  │             │  │  │                         │ │
│  └─────────────┘  │  └─────────────────────────┘ │
│  │                                                 │
└─────────────────────────────────────────────────┘
```

## Features Implementation

- **Responsive Design**: The layout adapts to different screen sizes
- **Interactive Elements**: Hover effects, active states, and smooth transitions
- **Accessibility**: Proper ARIA labels and keyboard navigation support
- **Modern UX**: Clean, intuitive interface following current design trends
