import React, { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInterviewStore } from '@/store/interviewStore'
import { createRtasrWebSocket, parseRtasrResult, setAudioActiveState, cleanupQuestionDetection } from '@/api/xfyunRtasr'
import RecorderManager from '@/api/utils/xfyunRtasr/index.esm.js'
import { isAudioActive } from '@/utils/voiceIdentifier'
import { handleQuestionDetected } from '@/api/deepseek'
import { getCustomSystemPrompt, setCustomSystemPrompt, resetCustomSystemPrompt, STABLE_SYSTEM_PROMPT } from '@/utils/questionDetection'
import ReactMarkdown from 'react-markdown'

const InterviewMeeting: React.FC = () => {
  const navigate = useNavigate()
  const addTransResult = useInterviewStore(s => s.addTransResult)
  const addMessage = useInterviewStore(s => s.addMessage)
  const messages = useInterviewStore(s => s.messages)
  const answers = useInterviewStore(s => s.answers)
  const [recording, setRecording] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const recorderRef = useRef<any>(null)
  const [audioActive, setAudioActive] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [promptModalOpen, setPromptModalOpen] = useState(false)
  const [promptEditing, setPromptEditing] = useState(STABLE_SYSTEM_PROMPT)
  
  // 自动滚动到底部的引用
  const chatAreaRef = useRef<HTMLDivElement>(null)
  const voiceAreaRef = useRef<HTMLDivElement>(null)
  const voiceContentRef = useRef<HTMLDivElement>(null)

  // 处理转写结果
  const handleRtasrResult = (data: any) => {
    console.log('【data】', data)
    if (data.action === 'result') {
      if (data.code === '0') {
        const parsedData = typeof data.data === 'string' ? JSON.parse(data.data) : data.data
        addTransResult({
          action: data.action,
          code: data.code,
          data: parsedData,
          desc: data.desc,
          sid: data.sid,
        })
        // 解析文本内容，集成智能AI问题检测
        const msgs = parseRtasrResult(parsedData, () => handleQuestionDetected())
        msgs.forEach(msg => {
          addMessage(msg)
          console.log('【MeetingMessage】', msg)
        })
      } else {
        // TODO:错误处理
        console.error('【转写错误】', data.desc)
      }
    }
  }

  // 开始面试
  const handleStart = async () => {
    setRecording(true)
    const recorder = new RecorderManager('/xfyunRtasr')
    recorderRef.current = recorder
    const ws = createRtasrWebSocket({
      onResult: handleRtasrResult,
      onError: () => setRecording(false),
      onClose: () => setRecording(false),
      onOpen: async () => {
        // 只有 WebSocket 连接成功后才启动录音
        recorder.onFrameRecorded = ({ isLastFrame, frameBuffer }: any) => {
          const audioActiveState = isAudioActive(frameBuffer, 0.01)
          setAudioActive(audioActiveState)
          // 同步音频状态到问题检测系统
          setAudioActiveState(audioActiveState)
          
          if (ws.readyState === ws.OPEN) {
            ws.send(new Int8Array(frameBuffer))
            if (isLastFrame) {
              ws.send('{"end": true}')
            }
          }
        }
        recorder.onStop = () => { }
        await recorder.start({ sampleRate: 16000, frameSize: 1280 })
      }
    })
    wsRef.current = ws
  }
  // 停止面试
  const handleStop = () => {
    setRecording(false)
    recorderRef.current?.stop()
    wsRef.current?.close()
    // 清理问题检测相关资源
    cleanupQuestionDetection()
  }

  // 手动触发AI回答（绕过静音检测，保底可用）
  const handleManualAsk = async () => {
    if (aiLoading) return
    setAiLoading(true)
    try {
      await handleQuestionDetected()
    } finally {
      setAiLoading(false)
    }
  }

  // 手动输入问题发送（回车或点发送按钮）
  const handleSend = async () => {
    const text = inputValue.trim()
    if (!text || aiLoading) return
    setInputValue('')
    addMessage({ role: 'user', content: text, status: 'sent' })
    setAiLoading(true)
    try {
      await handleQuestionDetected()
    } finally {
      setAiLoading(false)
    }
  }

  // 组件卸载时清理
  React.useEffect(() => {
    return () => {
      cleanupQuestionDetection()
    }
  }, [])

  // 自动滚动到底部
  React.useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight
    }
  }, [answers])

  React.useEffect(() => {
    if (voiceContentRef.current) {
      voiceContentRef.current.scrollTop = voiceContentRef.current.scrollHeight
    }
  }, [messages])

  return (
    <div style={{ 
      width: '100%', 
      height: '100vh', 
      background: '#fff', 
      display: 'flex', 
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* 主内容区 */}
      <div style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'row', 
        overflow: 'hidden',
        minHeight: 0 // 重要：允许flex子项收缩
      }}>
        {/* 聊天区：Q左A右分栏 */}
        <div 
          ref={chatAreaRef}
          style={{ 
            flex: 1, 
            padding: 24, 
            overflowY: 'auto', 
            display: 'flex', 
            flexDirection: 'column', 
            gap: 16,
            minHeight: 0 // 重要：允许滚动
          }}
        >
          {answers.length > 0 ? answers.map((ans, idx) => (
            <div key={ans.id || idx} style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'flex-start', 
              gap: 24,
              minHeight: 'fit-content'
            }}>
              {/* Q 左侧 */}
              <div style={{ 
                flex: 1, 
                background: '#f5f5f5', 
                borderRadius: 8, 
                padding: 12, 
                textAlign: 'left', 
                maxWidth: '30%',
                minWidth: '200px'
              }}>
                <b>Q:</b> {ans.question}
              </div>
              {/* A 右侧 */}
              <div style={{ 
                flex: 2, 
                background: '#e6f7ff', 
                borderRadius: 8, 
                padding: 12, 
                textAlign: 'left'
              }}>
                <b>A:</b> <ReactMarkdown>{ans.message}</ReactMarkdown>
              </div>
            </div>
          )) : (
            <div style={{ 
              fontSize: 32, 
              color: '#eee', 
              textAlign: 'center',
              margin: 'auto'
            }}>
              暂无问答
            </div>
          )}
        </div>
        
        {/* 语音区 */}
        <div 
          ref={voiceAreaRef}
          style={{ 
            width: 250, 
            borderLeft: '1px solid #eee', 
            padding: 16,
            overflowY: 'auto',
            minHeight: 0, // 重要：允许滚动
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <h3 style={{ margin: '0 0 16px 0', fontSize: 16, color: '#666', flexShrink: 0 }}>实时转录</h3>
          <div ref={voiceContentRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {messages.map((msg, idx) => (
              <div key={msg.id || idx} style={{ 
                marginBottom: 8, 
                background: msg.role === 'user' ? '#f0f8ff' : '#f5f5f5', 
                borderRadius: 8, 
                padding: 8,
                fontSize: 12,
                lineHeight: 1.4
              }}>
                <b style={{ color: msg.role === 'user' ? '#1677ff' : '#666' }}>
                  {msg.role === 'user' ? '用户' : '助手'}：
                </b>
                {msg.content}
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* 底部操作栏 - 固定在屏幕底部 */}
      <div style={{ 
        height: '80px',
        borderTop: '1px solid #eee', 
        padding: '16px 24px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        background: '#fff',
        boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.1)',
        flexShrink: 0
      }}>
        <div style={{ fontSize: 12, color: '#666' }}>
          帮助中心<br />
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <input type="checkbox" />
            固定当前答案
          </label>
        </div>
        
        <div style={{ flex: 1, margin: '0 24px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            style={{
              flex: 1,
              padding: '8px 12px',
              border: '1px solid #d9d9d9',
              borderRadius: 4,
              fontSize: 14
            }}
            placeholder="输入你的问题"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
          />
          <button
            style={{
              padding: '8px 16px',
              border: '1px solid #d9d9d9',
              borderRadius: 4,
              background: '#fff',
              cursor: 'pointer',
              fontSize: 14
            }}
            onClick={handleSend}
          >
            发送
          </button>
          <button
            style={{
              padding: '8px 12px',
              border: '1px solid #d9d9d9',
              borderRadius: 4,
              background: '#fff',
              cursor: 'pointer',
              fontSize: 12
            }}
            onClick={() => { setPromptEditing(getCustomSystemPrompt() || STABLE_SYSTEM_PROMPT); setPromptModalOpen(true) }}
          >
            自定义提示词
          </button>
          <button style={{ 
            padding: '8px 12px', 
            border: '1px solid #d9d9d9', 
            borderRadius: 4, 
            background: '#fff',
            cursor: 'pointer',
            fontSize: 12
          }}>
            笔记辅助
          </button>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              display: 'inline-block',
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: recording ? (audioActive ? '#52c41a' : '#ff4d4f') : '#d9d9d9',
            }} />
            <span style={{ fontSize: 12, color: '#666' }}>
              {recording ? (audioActive ? '录音中' : '静音中') : '未录音'}
            </span>
          </div>

          <button
            style={{
              padding: '10px 20px',
              border: 'none',
              borderRadius: 6,
              background: aiLoading ? '#bbb' : '#52c41a',
              color: '#fff',
              cursor: aiLoading ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 500,
            }}
            onClick={handleManualAsk}
            disabled={aiLoading}
          >
            {aiLoading ? '生成中...' : '生成回答'}
          </button>

          <button
            style={{
              background: recording ? '#ff4d4f' : '#1677ff',
              color: '#fff', 
              padding: '10px 20px', 
              border: 'none', 
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 500
            }} 
            onClick={recording ? handleStop : handleStart}
          >
            {recording ? '停止录音' : '开始面试'}
          </button>
          
          <button 
            style={{ 
              padding: '10px 16px', 
              border: '1px solid #d9d9d9', 
              borderRadius: 6, 
              background: '#fff',
              cursor: 'pointer',
              fontSize: 14
            }} 
            onClick={() => navigate('/interview/new')}
          >
            返回设置
          </button>
        </div>
      </div>
      {promptModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.45)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} onClick={() => setPromptModalOpen(false)}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 20, width: 560, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>自定义系统提示词</span>
              <span style={{ fontSize: 12, color: '#999' }}>
                {getCustomSystemPrompt() ? '当前：自定义' : '当前：默认'}
              </span>
            </div>
            <textarea
              style={{ width: '100%', height: 240, padding: 10, border: '1px solid #d9d9d9', borderRadius: 4, fontSize: 13, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }}
              value={promptEditing}
              onChange={e => setPromptEditing(e.target.value)}
              placeholder="编辑系统提示词，保存后下次AI回答生效"
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
              <button
                style={{ padding: '6px 14px', border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 13 }}
                onClick={() => { resetCustomSystemPrompt(); setPromptEditing(STABLE_SYSTEM_PROMPT) }}
              >
                恢复默认
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  style={{ padding: '6px 14px', border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 13 }}
                  onClick={() => setPromptModalOpen(false)}
                >
                  取消
                </button>
                <button
                  style={{ padding: '6px 14px', border: 'none', borderRadius: 4, background: '#1677ff', color: '#fff', cursor: 'pointer', fontSize: 13 }}
                  onClick={() => { setCustomSystemPrompt(promptEditing); setPromptModalOpen(false) }}
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default InterviewMeeting 