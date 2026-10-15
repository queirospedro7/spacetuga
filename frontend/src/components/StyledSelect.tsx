import { Children, isValidElement, type ReactNode } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const empty = '__tuga_empty_option__';
export function StyledSelect({ value, onChange, disabled, className, children, 'aria-label': label }: { value: string; onChange: (event: { target: { value: string } }) => void; disabled?: boolean; className?: string; children: ReactNode; 'aria-label'?: string }) {
  const options = Children.toArray(children).filter((child) => isValidElement<{ value: string; children: ReactNode; disabled?: boolean }>(child));
  return <Select value={value || empty} disabled={disabled} onValueChange={(next) => onChange({ target: { value: next === empty ? '' : next } })}>
    <SelectTrigger className={`w-full ${className || ''}`} aria-label={label || 'Selecionar opção'}><SelectValue /></SelectTrigger>
    <SelectContent>{options.map((option) => <SelectItem key={option.props.value || empty} value={option.props.value || empty} disabled={option.props.disabled}>{option.props.children}</SelectItem>)}</SelectContent>
  </Select>;
}
