import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await axios.post(
      "http://52.3.202.231:8080/bi/query",
      body,
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      }
    );

    return NextResponse.json(response.data);
  } catch (error) {
    console.error("API proxy error:", error);

    if (axios.isAxiosError(error)) {
      if (error.response) {
        return NextResponse.json(
          { error: "Server error", details: error.response.data },
          { status: error.response.status }
        );
      } else if (error.request) {
        return NextResponse.json(
          { error: "No response from server" },
          { status: 502 }
        );
      }
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
