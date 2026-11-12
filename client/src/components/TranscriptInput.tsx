/**
 * TranscriptInput Component
 * Allows users to paste transcript data directly
 * Design: Pixel punk style with neon borders
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface TranscriptInputProps {
  onSubmit: (text: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

export const TranscriptInput: React.FC<TranscriptInputProps> = ({
  onSubmit,
  onClose,
  isOpen,
}) => {
  const [text, setText] = useState('');

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (text.trim()) {
      onSubmit(text);
      setText('');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="pixel-panel-blue w-full max-w-2xl mx-4 p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold neon-glow-blue uppercase">PASTE TRANSCRIPT</h2>
          <button
            onClick={onClose}
            className="text-accent hover:text-neon-purple transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste your Claude Code JSONL transcript here..."
          className="w-full h-64 bg-background border-2 border-border p-3 font-mono text-sm text-foreground focus:outline-none focus:border-accent"
        />

        <div className="flex gap-3 mt-4">
          <Button
            onClick={handleSubmit}
            className="flex-1 bg-accent text-background font-bold uppercase border-2 border-accent hover:bg-background hover:text-accent"
          >
            LOAD
          </Button>
          <Button
            onClick={onClose}
            className="flex-1 bg-background text-foreground font-bold uppercase border-2 border-border hover:border-accent"
          >
            CANCEL
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TranscriptInput;
