"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import api from "@/lib/api";
import { Calendar, ChevronRight } from "lucide-react";

export default function HistoryPage() {
    const [encounters, setEncounters] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchEncounters = async () => {
            try {
                const res = await api.get("/encounters");
                setEncounters(res.data);
            } catch (error) {
                console.error("Failed to fetch history", error);
            } finally {
                setLoading(false);
            }
        };
        fetchEncounters();
    }, []);

    if (loading) return <div className="p-8">Loading history...</div>;

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight">History</h1>
            </div>

            {encounters.length === 0 ? (
                <Card>
                    <CardContent className="py-8 text-center text-slate-500">
                        No saved encounters yet. Start a new capture/analysis.
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {encounters.map((enc) => (
                        <Link key={enc.id} href={`/encounter/${enc.id}`} className="block">
                            <Card className="hover:bg-slate-50 transition-colors cursor-pointer">
                                <CardContent className="flex items-center justify-between p-6">
                                    <div className="space-y-1">
                                        <h3 className="font-bold text-lg text-slate-900">{enc.title}</h3>
                                        <div className="flex items-center gap-2 text-sm text-slate-500">
                                            <Calendar className="h-4 w-4" />
                                            {new Date(enc.createdAt).toLocaleDateString()} at {new Date(enc.createdAt).toLocaleTimeString()}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${enc.status === 'completed' ? 'bg-green-100 text-green-700' :
                                                enc.status === 'review' ? 'bg-indigo-100 text-indigo-700' :
                                                    'bg-slate-100 text-slate-700'
                                            }`}>
                                            {enc.status.toUpperCase()}
                                        </span>
                                        <ChevronRight className="text-slate-400" />
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
