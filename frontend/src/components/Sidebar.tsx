"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { Mic, FileText, Settings, History } from "lucide-react";

const navItems = [
    { href: "/", label: "Capture", icon: Mic },
    { href: "/history", label: "History", icon: History },
    { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
    const pathname = usePathname();

    return (
        <div className="flex flex-col h-screen w-64 bg-slate-900 text-white border-r">
            <div className="p-6">
                <h1 className="text-xl font-bold">MedScribe</h1>
            </div>
            <nav className="flex-1 px-4 space-y-2">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={clsx(
                                "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                                isActive
                                    ? "bg-slate-800 text-white"
                                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                            )}
                        >
                            <item.icon size={20} />
                            <span>{item.label}</span>
                        </Link>
                    );
                })}
            </nav>
            <div className="p-4 border-t border-slate-800 space-y-3">
                <div className="space-y-1">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">AI Engines</div>
                    <div className="text-xs text-slate-400 flex flex-col gap-1">
                        <span className="flex items-center gap-1.5">
                            <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                            Analysis: MedGemma 1.5
                        </span>
                        <span className="flex items-center gap-1.5">
                            <div className="h-1.5 w-1.5 rounded-full bg-pink-500" />
                            Transcription: MedASR
                        </span>
                    </div>
                </div>
                <div className="text-[10px] text-slate-600">v1.1.0 • Google Health AI</div>
            </div>
        </div>
    );
}
