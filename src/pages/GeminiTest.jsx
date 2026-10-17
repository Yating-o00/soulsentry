import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Send, Sparkles, AlertCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";

export default function GeminiTestPage() {
    const [prompt, setPrompt] = useState("");
    const [response, setResponse] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async () => {
        if (!prompt.trim()) return;

        setLoading(true);
        setError(null);
        setResponse(null);

        try {
            // Check if backend functions are enabled/available first if possible, 
            // but here we directly call the function we just created.
            // Note: In Base44, custom backend functions are typically accessed via base44.functions.functionName
            const result = await base44.functions.gemini({ prompt });

            if (result.success) {
                setResponse(result.text);
            } else {
                setError(result.error || "Unknown error occurred");
            }
        } catch (err) {
            console.error(err);
            setError(err.message || "Failed to call backend function. Make sure Backend Functions are enabled in settings.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 p-6 flex flex-col items-center">
            <div className="max-w-3xl w-full space-y-6">
                <div className="text-center space-y-2 mb-8">
                    <h1 className="text-3xl font-bold text-slate-900 flex items-center justify-center gap-3">
                        <Sparkles className="w-8 h-8 text-blue-500" />
                        Google Gemini API 测试
                    </h1>
                    <p className="text-slate-500">
                        通过自定义后端函数直接调用 Gemini 1.5 Flash 模型
                    </p>
                </div>

                <Card className="border-0 shadow-lg bg-white overflow-hidden">
                    <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4">
                        <CardTitle className="text-lg font-medium text-slate-700">输入提示词</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4">
                        <Textarea
                            placeholder="输入你想问 Gemini 的问题..."
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            className="min-h-[120px] text-base resize-y bg-white focus:bg-slate-50 transition-colors"
                        />
                        <div className="flex justify-end">
                            <Button 
                                onClick={handleSubmit} 
                                disabled={loading || !prompt.trim()}
                                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md transition-all px-6"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        思考中...
                                    </>
                                ) : (
                                    <>
                                        <Send className="w-4 h-4 mr-2" />
                                        发送请求
                                    </>
                                )}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 text-red-700 animate-in fade-in slide-in-from-bottom-2">
                        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                        <div>
                            <h3 className="font-semibold text-sm mb-1">请求失败</h3>
                            <p className="text-sm opacity-90">{error}</p>
                        </div>
                    </div>
                )}

                {response && (
                    <Card className="border-0 shadow-md bg-white animate-in fade-in slide-in-from-bottom-4">
                        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50/50 border-b border-blue-100/50 pb-3">
                            <div className="flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-blue-600" />
                                <CardTitle className="text-sm font-semibold text-blue-900">Gemini 回复</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="prose prose-slate max-w-none prose-p:leading-relaxed prose-headings:text-slate-800 prose-a:text-blue-600">
                                <ReactMarkdown>{response}</ReactMarkdown>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}