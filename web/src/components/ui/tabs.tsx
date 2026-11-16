import * as React from 'react';

interface TabsContextValue {
  value: string;
  onValueChange: (val: string) => void;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

export const Tabs: React.FC<{
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}> = ({ value, onValueChange, children, className = '' }) => (
  <TabsContext.Provider value={{ value, onValueChange }}>
    <div className={className}>{children}</div>
  </TabsContext.Provider>
);

export const TabsList: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <div
    className={`inline-flex items-center gap-1 rounded-none bg-[#0A0A0A] border border-white/[0.12] p-1 ${className}`}
  >
    {children}
  </div>
);

export const TabsTrigger: React.FC<{
  value: string;
  children: React.ReactNode;
  className?: string;
}> = ({ value, children, className = '' }) => {
  const ctx = React.useContext(TabsContext);
  const active = ctx?.value === value;
  return (
    <button
      type="button"
      onClick={() => ctx?.onValueChange(value)}
      className={`px-3 py-1.5 rounded-none text-[12px] font-medium transition-colors duration-150 cursor-pointer ${
        active
          ? 'bg-[#FFFFFF] text-[#000000]'
          : 'text-[#A1A1AA] hover:text-[#FFFFFF]'
      } ${className}`}
    >
      {children}
    </button>
  );
};
