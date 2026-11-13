import {
  Description,
  FieldError,
  Input,
  Label,
  ListBox,
  Select,
  TextField
} from '@heroui/react'
import type { ReactNode } from 'react'

export interface SelectOption {
  label: string
  value: string
  description?: string
}

interface BaseFieldProps {
  label: string
  help?: ReactNode
  disabled?: boolean
}

interface TextFieldProps extends BaseFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: 'text' | 'password'
  error?: string
}

export const TextFieldInput = ({
  label,
  help,
  value,
  onChange,
  placeholder,
  type = 'text',
  error,
  disabled
}: TextFieldProps) => (
  <TextField
    fullWidth
    isDisabled={disabled}
    isInvalid={Boolean(error)}
    value={value}
    onChange={onChange}
  >
    <Label className="font-semibold">{label}</Label>
    <Input variant="secondary" placeholder={placeholder || label} type={type} />
    {error ? <FieldError>{error}</FieldError> : help ? <Description>{help}</Description> : null}
  </TextField>
)

interface SelectFieldProps extends BaseFieldProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
}

export const SelectField = ({ label, help, value, onChange, options, disabled }: SelectFieldProps) => (
  <Select
    fullWidth
    isDisabled={disabled}
    selectedKey={value}
    variant="secondary"
    onSelectionChange={(key) => {
      if (key !== null) onChange(String(key))
    }}
  >
    <Label className="font-semibold">{label}</Label>
    <Select.Trigger>
      <Select.Value />
      <Select.Indicator />
    </Select.Trigger>
    {help ? <Description>{help}</Description> : null}
    <Select.Popover>
      <ListBox>
        {options.map((option) => (
          <ListBox.Item key={option.value} id={option.value} textValue={option.label}>
            <div className="flex min-w-0 flex-col gap-0.5">
              <Label>{option.label}</Label>
              {option.description ? <Description>{option.description}</Description> : null}
            </div>
            <ListBox.ItemIndicator />
          </ListBox.Item>
        ))}
      </ListBox>
    </Select.Popover>
  </Select>
)
