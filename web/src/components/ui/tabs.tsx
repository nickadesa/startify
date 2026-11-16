import * as React from 'react';

interface TabsContextValue {
  value: string;
  onValueChange: (val: string) => void;
}

const TabsContext = React.createContext<TabsContextValue>({
  value: '',
  onValueChange: () => {},
});

export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  onValueChange: (val: string) => void;
}

export const Tabs: React.FC<TabsProps> = ({
  value,
  onValueChange,
  className = '',
  children,
  ...props
}) => (
  <TabsContext.Provider value={{ value, onValueChange }}>
    <div className={className} {...props}>
      {children}
    </div>
  </TabsContext.Provider>
);

export const TabsList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className = '', ...props }, ref) => (
    <div
      ref={ref}
      role="tablist"
      className={`inline-flex items-center gap-1 rounded-xl bg-[#141417] p-1 border border-white/[0.06] ${className}`}
      {...props}
    />
  )
);
TabsList.displayName = 'TabsList';

export interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

export const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className = '', value, ...props }, ref) => {
    const ctx = React.useContext(TabsContext);
    const active = ctx.value === value;
    return (
      <button
        ref={ref}
        type="button"
        role="tab"
        aria-selected={active}
        onClick={() => ctx.onValueChange(value)}
        className={`inline-flex items-center justify-center rounded-lg px-3 py-1 text-[12px] font-medium tracking-[-0.005em] select-none cursor-pointer active:scale-[0.97] transition-[transform,background-color,color,border-color] duration-150 ease-out ${
          active
            ? 'bg-[#242429] text-[#F5F5F7] border border-white/[0.09]'
            : 'text-[#8E8E93] hover:text-[#F5F5F7] border border-transparent'
        } ${className}`}
        {...props}
      />
    );
  }
);
TabsTrigger.displayName = 'TabsTrigger';

export interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

export const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className = '', value, children, ...props }, ref) => {
    const ctx = React.useContext(TabsContext);
    if (ctx.value !== value) return null;
    return (
      <div ref={ref} role="tabpanel" className={className} {...props}>
        {children}
      </div>
    );
  }
);
TabsContent.displayName = 'TabsContent';
