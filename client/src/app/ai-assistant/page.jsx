'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, Sparkles, Loader2, CheckCircle2, Circle, MessageSquare, Plus, PanelLeftClose, PanelLeftOpen, Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import styles from './ai-assistant.module.css';
import LockBodyScroll from '@/components/LockBodyScroll';

const generateId = () => Math.random().toString(36).substr(2, 9);
const formatTime = (isoString) => {
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// Zero state suggestions
const suggestions = [
  { id: 1, label: 'Check enrollment status' },
  { id: 2, label: 'Find pending batches' },
  { id: 3, label: 'Show flagged cases' },
  { id: 4, label: 'Summarize recent activity' }
];

export default function AIAssistantPage() {
  const router = useRouter();
  
  // State: Multiple Conversations
  const [conversations, setConversations] = useState([
    {
      id: 'chat-initial',
      title: 'Current Queue Analysis',
      timestamp: new Date().toISOString(),
      messages: [
        { id: generateId(), role: 'ai', text: 'Hello! I am your AI Enrollment Assistant. Ask me about members, batches, or enrollment status.', timestamp: new Date().toISOString() }
      ]
    }
  ]);
  const [currentChatId, setCurrentChatId] = useState('chat-initial');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Active chat references
  const currentChat = conversations.find(c => c.id === currentChatId) || conversations[0];
  const messages = currentChat.messages || [];

  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processSteps, setProcessSteps] = useState([
    { id: '1', title: 'Understanding Query', detail: 'Waiting for input...', status: 'pending' },
    { id: '2', title: 'Fetching Data', detail: 'Waiting...', status: 'pending' },
    { id: '3', title: 'Analyzing Results', detail: 'Waiting...', status: 'pending' },
    { id: '4', title: 'Generating Response', detail: 'Waiting...', status: 'pending' }
  ]);

  const messagesEndRef = useRef(null);
  const chatWindowRef = useRef(null);
  const [userIsAtBottom, setUserIsAtBottom] = useState(true);

  // Scroll logic: Track if user scrolled up
  const handleScroll = () => {
    if (!chatWindowRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatWindowRef.current;
    // Allow 10px threshold
    const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 10;
    setUserIsAtBottom(isAtBottom);
  };

  const scrollToBottom = (force = false) => {
    if (force || userIsAtBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Scroll to bottom on new messages if at bottom
  useEffect(() => {
    scrollToBottom();
  }, [messages, isProcessing]);

  // Create New Chat
  const handleNewChat = () => {
    const newChatId = generateId();
    setConversations(prev => [
      {
        id: newChatId,
        title: 'New Conversation',
        timestamp: new Date().toISOString(),
        messages: []
      },
      ...prev
    ]);
    setCurrentChatId(newChatId);
    setInputValue('');
  };

  const addMessageToChat = (chatId, messageObj) => {
    setConversations(prev => prev.map(chat => {
      if (chat.id === chatId) {
        // Auto-title generation on first user prompt
        const isFirstUserMessage = messageObj.role === 'user' && chat.messages.filter(m => m.role === 'user').length === 0;
        let newTitle = chat.title;
        if (isFirstUserMessage) {
          newTitle = messageObj.text.length > 30 ? messageObj.text.substring(0, 30) + '...' : messageObj.text;
        }
        return {
          ...chat,
          title: newTitle,
          messages: [...chat.messages, messageObj]
        };
      }
      return chat;
    }));
  };

  const simulateProcessingFlow = async (queryText, activeChatId) => {
    setIsProcessing(true);
    // Force scroll to bottom when AI starts
    scrollToBottom(true);
    
    setProcessSteps([
      { id: '1', title: 'Understanding Query', detail: 'Interpreting intent', status: 'active' },
      { id: '2', title: 'Fetching Data', detail: 'Waiting...', status: 'pending' },
      { id: '3', title: 'Analyzing Results', detail: 'Waiting...', status: 'pending' },
      { id: '4', title: 'Generating Response', detail: 'Waiting...', status: 'pending' }
    ]);

    const updateStep = (id, status, detail) => {
      setProcessSteps(prev => prev.map(step => 
        step.id === id ? { ...step, status, detail: detail || step.detail } : step
      ));
    };

    const delay = (ms) => new Promise(res => setTimeout(res, ms));

    await delay(800);
    updateStep('1', 'completed', 'Intent extracted');
    updateStep('2', 'active', 'Querying systems...');

    await delay(1200);
    updateStep('2', 'completed', 'Data retrieved');
    updateStep('3', 'active', 'Applying rules...');

    await delay(800);
    updateStep('3', 'completed', 'Criteria checked');
    updateStep('4', 'active', 'Formatting output...');

    await delay(600);
    updateStep('4', 'completed', 'Response ready');

    let responseText = "Based on the system rules, everything looks normal.";
    let actions = [];
    let structuredData = null;

    const lowerQuery = queryText.toLowerCase();
    if (lowerQuery.includes('member') || lowerQuery.includes('status')) {
      responseText = "Here are the members currently requiring attention:";
      structuredData = [
        { memberId: 'M001', name: 'John Doe', payer: 'Aetna', effectiveDate: '01-Jan-2025', actionNeeded: 'Awaiting Input', status: 'Awaiting Input' },
        { memberId: 'M002', name: 'Sara Kim', payer: 'United', effectiveDate: '15-Feb-2025', actionNeeded: 'Ready', status: 'Ready' }
      ];
    } else if (lowerQuery.includes('batch')) {
      responseText = "Batch 002 is prepared for approval with 12 clean members.";
      actions = [{ label: 'Review Batch 002', route: '/batch-preparation' }];
    } else if (lowerQuery.includes('flag') || lowerQuery.includes('clarification')) {
      responseText = "3 members are missing critical plan identifiers.";
      actions = [{ label: 'Provide Information', route: '/clarifications' }];
    }

    addMessageToChat(activeChatId, {
      id: generateId(),
      role: 'ai',
      text: responseText,
      actions,
      structuredData,
      timestamp: new Date().toISOString()
    });

    setIsProcessing(false);
  };

  const handleSend = (e, customText = null) => {
    if (e) e.preventDefault();
    const textToSend = customText || inputValue;
    if (!textToSend.trim() || isProcessing) return;

    setInputValue('');
    const targetChatId = currentChatId;

    addMessageToChat(targetChatId, { 
      id: generateId(), 
      role: 'user', 
      text: textToSend.trim(),
      timestamp: new Date().toISOString()
    });

    simulateProcessingFlow(textToSend.trim(), targetChatId);
  };

  const handleActionClick = (route) => {
    router.push(route);
  };

  return (
    <div className={styles.container} suppressHydrationWarning>
      <LockBodyScroll />
      
      {/* LEFT COLUMN: HISTORY SIDEBAR */}
      {isSidebarOpen && (
        <div className={styles.historyColumn}>
          <div className={styles.historyHeader}>
            <button className={styles.newChatBtn} onClick={handleNewChat}>
              <Plus size={16} /> New Chat
            </button>
            <button className={styles.iconBtn} onClick={() => setIsSidebarOpen(false)}>
              <PanelLeftClose size={18} />
            </button>
          </div>
          <div className={styles.historyList}>
            <div className={styles.historyGroupTitle}>Recent</div>
            {conversations.map(chat => (
              <div 
                key={chat.id} 
                className={`${styles.historyCard} ${currentChat.id === chat.id ? styles.historyCardActive : ''}`}
                onClick={() => setCurrentChatId(chat.id)}
              >
                <MessageSquare size={14} className={styles.historyIcon} />
                <div className={styles.historyCardContent}>
                  <div className={styles.historyCardTitle}>{chat.title}</div>
                  <div className={styles.historyCardTime}>{formatTime(chat.timestamp)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CENTER COLUMN: CHAT INTERFACE */}
      <div className={styles.chatColumn} suppressHydrationWarning>
        <div className={styles.chatHeader}>
          <div className={styles.chatTitle}>
            {!isSidebarOpen && (
              <button className={styles.iconBtn} onClick={() => setIsSidebarOpen(true)} style={{marginRight: '8px'}}>
                <PanelLeftOpen size={18} />
              </button>
            )}
            <Bot className="lucide-icon" size={20} color="var(--primary)" />
            HealthEnroll AI
          </div>
        </div>
        
        <div className={styles.chatWindow} ref={chatWindowRef} onScroll={handleScroll}>
          
          {/* Zero State / Suggestions (if empty) */}
          {messages.length === 0 && (
            <div className={styles.zeroState}>
              <div className={styles.zeroStateIcon}><Sparkles size={32} color="var(--primary)" /></div>
              <h2>How can I help you today?</h2>
              <div className={styles.suggestionGrid}>
                {suggestions.map(s => (
                  <button key={s.id} className={styles.suggestionCard} onClick={() => handleSend(null, s.label)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chat Messages */}
          {messages.length > 0 && (
            <div style={{display: 'flex', flexDirection: 'column', gap: 'var(--space-4)'}}>
              {messages.map((msg) => (
                <div key={msg.id} className={`${styles.messageWrapper} ${msg.role === 'user' ? styles.messageWrapperUser : styles.messageWrapperAI}`}>
                  <div className={`${styles.message} ${msg.role === 'user' ? styles.messageUser : styles.messageAI}`}>
                    <div className={styles.messageText}>{msg.text}</div>
                    
                    {/* Structured Data: Stacked Member Cards */}
                    {msg.structuredData && (
                      <div className={styles.memberCardList}>
                        {msg.structuredData.map(member => (
                          <div key={member.memberId} className={styles.memberCard}>
                            <div className={styles.memberCardHeader}>
                              <div className={styles.memberCardTitle}>
                                <span className={styles.memberId}>{member.memberId}</span>
                                <span className={styles.memberName}>{member.name}</span>
                              </div>
                              <span className={`${styles.badge} ${
                                member.status === 'Ready' ? styles.badgeReady :
                                member.status === 'Awaiting Input' ? styles.badgeAwaiting : styles.badgeError
                              }`}>
                                {member.actionNeeded}
                              </span>
                            </div>
                            <div className={styles.memberCardBody}>
                              <div className={styles.detailRow}>
                                <span className={styles.detailLabel}>Payer</span>
                                <span className={styles.detailValue}>{member.payer}</span>
                              </div>
                              <div className={styles.detailRow}>
                                <span className={styles.detailLabel}>Date</span>
                                <span className={styles.detailValue}>{member.effectiveDate}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Optional Action Buttons */}
                    {msg.actions && msg.actions.length > 0 && (
                      <div className={styles.quickActions}>
                        {msg.actions.map(action => (
                          <button key={action.label} className={styles.quickActionButton} onClick={() => handleActionClick(action.route)}>
                            {action.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* WhatsApp style Timestamp */}
                    <div className={`${styles.messageTime} ${msg.role === 'user' ? styles.messageTimeUser : styles.messageTimeAI}`}>
                      {formatTime(msg.timestamp)}
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Type Indicator */}
              {isProcessing && (
                <div className={`${styles.messageWrapper} ${styles.messageWrapperAI}`}>
                  <div className={`${styles.message} ${styles.messageAI}`}>
                    <div className={styles.typingIndicator}>
                      <div className={styles.dot}></div>
                      <div className={styles.dot}></div>
                      <div className={styles.dot}></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <div ref={messagesEndRef} style={{height: 1}} />
        </div>

        {/* INPUT BOX */}
        <form className={styles.inputArea} onSubmit={(e) => handleSend(e)}>
          <div className={styles.inputPill}>
            <input
              type="text"
              className={styles.input}
              placeholder="Message your enrollment assistant..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isProcessing}
            />
            <button 
              type="submit" 
              className={styles.sendButton}
              disabled={!inputValue.trim() || isProcessing}
            >
              <Send size={18} />
            </button>
          </div>
        </form>
      </div>

      {/* RIGHT COLUMN: PROCESSING PANEL */}
      <div className={styles.processingColumn} suppressHydrationWarning>
        <div className={styles.processingHeader}>
          <div className={styles.processingTitle}>
            <Sparkles className="lucide-icon" size={18} color="var(--primary)" />
            Processing Engine
          </div>
        </div>
        
        <div className={styles.processingBody}>
          {processSteps.map((step) => {
            let StepIcon = Circle;
            let iconClass = styles.stepIcon;
            
            if (step.status === 'active') {
              StepIcon = Loader2;
              iconClass = `${styles.stepIcon} ${styles.stepIconActive} animate-spin`;
            } else if (step.status === 'completed') {
              StepIcon = CheckCircle2;
              iconClass = `${styles.stepIcon} ${styles.stepIconCompleted}`;
            }

            return (
              <div key={step.id} className={styles.stepItem}>
                <div className={iconClass}>
                  <StepIcon size={14} className={step.status === 'active' ? 'animate-spin' : ''} />
                </div>
                <div className={styles.stepContent}>
                  <div className={`${styles.stepTitle} ${step.status === 'active' ? styles.stepTitleActive : (step.status === 'pending' ? styles.stepTitlePending : '')}`}>
                    {step.title}
                  </div>
                  <div className={styles.stepDetail}>
                    {step.detail}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
