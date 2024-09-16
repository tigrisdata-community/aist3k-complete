import React from "react";

interface ButtonProps {
  className: string;
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  className,
  onClick,
  disabled,
  children,
}) => {
  const baseClasses = "px-4 py-2 bg-blue-500 text-white rounded";
  return (
    <button
      className={`${baseClasses} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

export default Button;
