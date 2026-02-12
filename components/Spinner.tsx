
import React from 'react';

interface SpinnerProps {
  className?: string;
}

const Spinner: React.FC<SpinnerProps> = ({ className }) => {
  if (className) {
    return (
      <div className={`animate-spin rounded-full border-t-2 border-b-2 border-blue-500 ${className}`}></div>
    );
  }

  return (
    <div className="flex justify-center items-center h-full">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
    </div>
  );
};

export default Spinner;
