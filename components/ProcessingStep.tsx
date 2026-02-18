import React from 'react';
import { CheckCircle, Circle, Loader2 } from 'lucide-react';

interface ProcessingStepProps {
  status: 'idle' | 'processing' | 'complete' | 'error';
  title: string;
  description: string;
}

const ProcessingStep: React.FC<ProcessingStepProps> = ({ status, title, description }) => {
  return (
    <div className="flex items-start group">
      <div className="flex-shrink-0 mt-0.5">
        {status === 'complete' && <CheckCircle className="h-6 w-6 text-lime-400 drop-shadow-[0_0_8px_rgba(163,230,53,0.5)]" />}
        {status === 'processing' && <Loader2 className="h-6 w-6 text-cyan-400 animate-spin drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]" />}
        {status === 'idle' && <Circle className="h-6 w-6 text-slate-600 group-hover:text-slate-500 transition-colors" />}
        {status === 'error' && <Circle className="h-6 w-6 text-red-500" />}
      </div>
      <div className="ml-4 w-0 flex-1">
        <p className={`text-sm font-medium transition-colors ${
          status === 'processing' ? 'text-cyan-400' : 
          status === 'complete' ? 'text-lime-400' : 
          'text-slate-300'
        }`}>
          {title}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
    </div>
  );
};

export default ProcessingStep;