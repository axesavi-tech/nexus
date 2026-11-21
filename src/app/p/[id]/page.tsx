"use client";
import { use } from "react";
import { AuthGate } from "@/components/AuthGate";
import { Journey } from "@/components/journey/Journey";

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AuthGate><Journey id={id} /></AuthGate>;
}
