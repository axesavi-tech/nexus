"use client";
import { use } from "react";
import { AuthGate } from "@/components/AuthGate";
import { Workspace } from "@/components/Workspace";

export default function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AuthGate><Workspace id={id} /></AuthGate>;
}
