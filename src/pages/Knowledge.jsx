import React, { useState } from "react";
import { Brain, MessageSquare, Database } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AIKnowledgeBase from "../components/knowledge/AIKnowledgeBase";
import KnowledgeBaseManager from "../components/knowledge/KnowledgeBaseManager";
import { motion } from "framer-motion";

export default function Knowledge() {
  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4 mb-6"
      >
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-600/20">
          <Brain className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
            AI 知识库
          </h1>
          <p className="text-slate-600">你的智能知识助手</p>
        </div>
      </motion.div>

      {/* Tabs */}
      <Tabs defaultValue="chat" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-white shadow-md rounded-xl p-1">
          <TabsTrigger 
            value="chat" 
            className="rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-blue-600 data-[state=active]:text-white"
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            AI 问答
          </TabsTrigger>
          <TabsTrigger 
            value="manage"
            className="rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-blue-600 data-[state=active]:text-white"
          >
            <Database className="w-4 h-4 mr-2" />
            知识管理
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="mt-6">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden" style={{ height: "calc(100vh - 280px)" }}>
            <AIKnowledgeBase open={true} />
          </div>
        </TabsContent>

        <TabsContent value="manage" className="mt-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <KnowledgeBaseManager />
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  );
}