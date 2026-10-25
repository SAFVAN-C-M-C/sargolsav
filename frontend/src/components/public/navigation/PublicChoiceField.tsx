import { useId, useState } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';
import { PublicIcon } from './PublicIcon';

export interface PublicChoiceOption { value: string; label: string; description?: string }

const ChoiceTrigger = styled(ButtonBase)(({ theme }) => ({
  width: '100%', minHeight: 76, padding: '14px 16px', gap: 14, textAlign: 'left',
  justifyContent: 'space-between', border: `1px solid ${theme.palette.divider}`,
  borderRadius: 18, background: theme.palette.background.paper, color: theme.palette.text.primary,
  boxShadow: '0 4px 16px #193f3705',
  '&:hover': { borderColor: theme.palette.primary.main, background: '#f9fcf8' },
  '&:focus-visible': { outline: `3px solid ${theme.palette.secondary.main}`, outlineOffset: 3 },
}));

const ChoiceOption = styled(MenuItem)(({ theme }) => ({
  minHeight: 64, whiteSpace: 'normal', gap: 12, borderRadius: 14, marginBottom: 6,
  padding: '12px 14px', border: '1px solid transparent', color: theme.palette.text.primary,
  '&.Mui-selected': { background: theme.palette.action.hover, borderColor: theme.palette.divider },
  '&.Mui-selected:hover': { background: '#e0ece3' },
  '&.Mui-focusVisible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: -2 },
}));

export function PublicChoiceField({ label, value, options, onChange }: {
  label: string; value: string; options: PublicChoiceOption[]; onChange: (value: string) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((option) => option.value === value);
  const visible = options.filter((option) => option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const dismiss = () => { setOpen(false); setQuery(''); };
  return <>
    <ChoiceTrigger aria-label={label} aria-haspopup="dialog" aria-expanded={open}
      aria-controls={open ? `${id}-dialog` : undefined} onClick={() => setOpen(true)}>
      <PublicIcon name="categories" sx={{ color: 'primary.main', fontSize: 23, flexShrink: 0 }} />
      <Box component="span" sx={{ minWidth: 0, flex: 1 }}>
        <Typography component="span" sx={{ display: 'block', fontSize: '.7rem', color: 'text.secondary', fontWeight: 600, mb: .5 }}>{label}</Typography>
        <Typography component="span" sx={{ display: 'block', fontSize: '.95rem', fontWeight: 700, overflowWrap: 'anywhere' }}>{selected?.label ?? 'Choose an option'}</Typography>
      </Box>
      <PublicIcon name="chevron" sx={{ fontSize: 22, color: 'primary.main', flexShrink: 0 }} />
    </ChoiceTrigger>
    <Dialog open={open} onClose={dismiss} fullWidth maxWidth="sm" id={`${id}-dialog`}
      aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
      sx={{ '& .MuiDialog-container': { alignItems: { xs: 'flex-end', sm: 'center' } } }}
      slotProps={{ paper: { sx: {
        m: { xs: 0, sm: 3 }, width: { xs: '100%', sm: 'calc(100% - 48px)' },
        maxHeight: '85dvh', borderRadius: { xs: '28px 28px 0 0', sm: '24px' },
        boxShadow: '0 -12px 60px #102b2530', pb: 'env(safe-area-inset-bottom)',
      } } }}>
      <Box aria-hidden="true" sx={{ display: { xs: 'block', sm: 'none' }, width: 36, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', mt: 1.25 }} />
      <Box sx={{ display: 'flex', alignItems: 'center', px: 1, pt: 1 }}>
        <DialogTitle id={`${id}-title`} sx={{ flex: 1, fontSize: '1.15rem', fontWeight: 750, p: 2 }}>{label}</DialogTitle>
        <IconButton aria-label={`Close ${label}`} onClick={dismiss} sx={{ mr: 1, minWidth: 44, minHeight: 44, color: 'text.secondary' }}><PublicIcon name="close" /></IconButton>
      </Box>
      <Typography id={`${id}-description`} sx={{ px: 3, mb: 1.5, fontSize: '.85rem', color: 'text.secondary' }}>Choose what you’d like to see.</Typography>
      {options.length > 8 && <TextField label="Search options" value={query} onChange={(event) => setQuery(event.target.value)} size="small" sx={{ mx: 3, mb: 1 }} />}
      <DialogContent sx={{ p: 1.5, pt: 0, overscrollBehavior: 'contain' }}>
        <MenuList autoFocusItem={open && options.length <= 8} variant="selectedMenu" role="listbox" aria-label={label}>
          {visible.map((option) => <ChoiceOption key={option.value} role="option" aria-selected={option.value === value} selected={option.value === value}
            onClick={() => { dismiss(); if (option.value !== value) onChange(option.value); }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: '.95rem', fontWeight: option.value === value ? 700 : 550, overflowWrap: 'anywhere' }}>{option.label}</Typography>
              {option.description && <Typography sx={{ mt: .4, fontSize: '.75rem', color: 'text.secondary' }}>{option.description}</Typography>}
            </Box>
            {option.value === value && <PublicIcon name="check" sx={{ color: 'primary.main', fontSize: 21, flexShrink: 0 }} />}
          </ChoiceOption>)}
        </MenuList>
        {visible.length === 0 && <Typography role="status" sx={{ p: 2, color: 'text.secondary' }}>No matching options.</Typography>}
      </DialogContent>
    </Dialog>
  </>;
}
