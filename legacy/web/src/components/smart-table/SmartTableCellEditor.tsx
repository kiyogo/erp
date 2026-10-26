import React, { useState, useEffect, useRef } from 'react';

interface SmartTableCellEditorProps {
  initialValue: any;
  onSave: (val: any) => void;
  onCancel: () => void;
  inputType?: 'text' | 'number' | 'date';
}

export const SmartTableCellEditor: React.FC<SmartTableCellEditorProps> = ({
  initialValue,
  onSave,
  onCancel,
  inputType = 'text',
}) => {
  const [val, setVal] = useState<any>(initialValue ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      if (inputType === 'text') {
        inputRef.current.select();
      }
    }
  }, [inputType]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      onSave(inputType === 'number' ? Number(val) : val);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  };

  return (
    <input
      ref={inputRef}
      type={inputType}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => onSave(inputType === 'number' ? Number(val) : val)}
      onKeyDown={handleKeyDown}
      onClick={(e) => e.stopPropagation()}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 28,
        padding: '2px 6px',
        fontSize: 13,
        border: '2px solid #009688',
        borderRadius: 4,
        outline: 'none',
        background: '#FFFFFF',
        boxShadow: '0 0 0 2px rgba(0, 150, 136, 0.2)',
        boxSizing: 'border-box',
      }}
    />
  );
};
