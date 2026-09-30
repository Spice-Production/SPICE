import { Image } from 'expo-image';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  Switch as NativeSwitch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
  type KeyboardTypeOptions,
  type LayoutChangeEvent,
  type ReturnKeyTypeOptions,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from './icons';
import { useTheme, withAlpha, type Theme } from './theme';

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption' | 'eyebrow';

function textStyle(theme: Theme, variant: TextVariant): TextStyle {
  switch (variant) {
    case 'display':
      return { fontFamily: theme.font.bold, fontSize: theme.text.xxxl, lineHeight: 36, letterSpacing: -0.6, color: theme.fg };
    case 'title':
      return { fontFamily: theme.font.semibold, fontSize: theme.text.xl, lineHeight: 26, letterSpacing: -0.3, color: theme.fg };
    case 'heading':
      return { fontFamily: theme.font.semibold, fontSize: theme.text.lg, lineHeight: 22, letterSpacing: -0.2, color: theme.fg };
    case 'label':
      return { fontFamily: theme.font.medium, fontSize: theme.text.sm, lineHeight: 18, color: theme.fg };
    case 'caption':
      return { fontFamily: theme.font.regular, fontSize: theme.text.xs, lineHeight: 16, color: theme.fgMuted };
    case 'eyebrow':
      return {
        fontFamily: theme.font.semibold,
        fontSize: theme.text.xxs,
        lineHeight: 14,
        letterSpacing: 1.1,
        textTransform: 'uppercase',
        color: theme.accentText,
      };
    default:
      return { fontFamily: theme.font.regular, fontSize: theme.text.base, lineHeight: 20, color: theme.fg };
  }
}

export function Txt({
  variant = 'body',
  color,
  muted,
  weight,
  align,
  lines,
  style,
  children,
  selectable,
}: {
  variant?: TextVariant;
  color?: string;
  muted?: boolean;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  align?: TextStyle['textAlign'];
  lines?: number;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  selectable?: boolean;
}) {
  const theme = useTheme();
  const base = textStyle(theme, variant);
  return (
    <Text
      numberOfLines={lines}
      selectable={selectable}
      style={[
        base,
        muted ? { color: theme.fgMuted } : null,
        color ? { color } : null,
        weight ? { fontFamily: theme.font[weight] } : null,
        align ? { textAlign: align } : null,
        style,
      ]}
    >
      {children}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'inverse';

export function Button({
  label,
  icon,
  onPress,
  variant = 'secondary',
  size = 'md',
  disabled,
  loading,
  fullWidth,
  style,
  accessibilityLabel,
}: {
  label: string;
  icon?: IconName;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const height = size === 'sm' ? 32 : size === 'lg' ? 48 : 40;
  const palette = {
    primary: { bg: theme.accent, fg: theme.onAccent, border: 'transparent', pressed: withAlpha(theme.accent, 0.85) },
    inverse: { bg: theme.inverse, fg: theme.onInverse, border: 'transparent', pressed: withAlpha(theme.inverse, 0.85) },
    secondary: { bg: theme.hover, fg: theme.fg, border: 'transparent', pressed: theme.active },
    outline: { bg: 'transparent', fg: theme.fg, border: theme.border, pressed: theme.hover },
    ghost: { bg: 'transparent', fg: theme.fg, border: 'transparent', pressed: theme.hover },
    danger: { bg: theme.dangerSoft, fg: theme.danger, border: 'transparent', pressed: withAlpha(theme.danger, 0.2) },
  }[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={({ pressed }) => [
        {
          height,
          paddingHorizontal: size === 'sm' ? 12 : 16,
          borderRadius: theme.radius.md,
          backgroundColor: pressed ? palette.pressed : palette.bg,
          borderWidth: variant === 'outline' ? 1 : 0,
          borderColor: palette.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: inactive ? 0.5 : 1,
          alignSelf: fullWidth ? 'stretch' : 'auto',
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : icon ? (
        <Icon name={icon} size={size === 'sm' ? 16 : 18} color={palette.fg} />
      ) : null}
      <Text
        numberOfLines={1}
        style={{ fontFamily: theme.font.medium, fontSize: size === 'sm' ? theme.text.sm : theme.text.base, color: palette.fg }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  size = 40,
  iconSize,
  color,
  active,
  filled,
  variant = 'ghost',
  disabled,
  loading,
  badge,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  size?: number;
  iconSize?: number;
  color?: string;
  active?: boolean;
  filled?: boolean;
  variant?: 'ghost' | 'solid' | 'accent' | 'surface';
  disabled?: boolean;
  loading?: boolean;
  badge?: boolean;
}) {
  const theme = useTheme();
  const background =
    variant === 'accent' ? theme.accent : variant === 'solid' ? theme.inverse : variant === 'surface' ? theme.hover : 'transparent';
  const tint =
    color ??
    (variant === 'accent' ? theme.onAccent : variant === 'solid' ? theme.onInverse : active ? theme.accentText : theme.fg);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: !!active }}
      hitSlop={size < 40 ? (40 - size) / 2 : 0}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed && variant === 'ghost' ? theme.hover : background,
        opacity: disabled ? 0.4 : pressed && variant !== 'ghost' ? 0.85 : 1,
      })}
    >
      {loading ? (
        <ActivityIndicator size="small" color={tint} />
      ) : (
        <Icon name={icon} size={iconSize ?? Math.round(size * 0.5)} color={tint} filled={filled} />
      )}
      {badge ? (
        <View
          style={{
            position: 'absolute',
            top: size * 0.16,
            right: size * 0.16,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: theme.accent,
            borderWidth: 1.5,
            borderColor: theme.bg,
          }}
        />
      ) : null}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Card({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          borderWidth: 1,
          borderRadius: theme.radius.lg,
          padding: padded ? 16 : 0,
          gap: 12,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const theme = useTheme();
  return <View style={{ height: 1, backgroundColor: theme.border, marginHorizontal: inset }} />;
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' }) {
  const theme = useTheme();
  const colors = {
    neutral: [theme.hover, theme.fgMuted],
    accent: [theme.accentSoft, theme.accentText],
    success: [theme.successSoft, theme.success],
    warning: [theme.warningSoft, theme.warning],
    danger: [theme.dangerSoft, theme.danger],
  }[tone];
  return (
    <View style={{ backgroundColor: colors[0], borderRadius: theme.radius.full, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' }}>
      <Text style={{ color: colors[1], fontFamily: theme.font.medium, fontSize: theme.text.xxs }}>{label}</Text>
    </View>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => ({
        height: 32,
        paddingHorizontal: 12,
        borderRadius: theme.radius.full,
        borderWidth: 1,
        borderColor: selected ? theme.accent : theme.border,
        backgroundColor: selected ? theme.accentSoft : pressed ? theme.hover : 'transparent',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      })}
    >
      {icon ? <Icon name={icon} size={14} color={selected ? theme.accentText : theme.fgMuted} /> : null}
      <Text style={{ fontFamily: theme.font.medium, fontSize: theme.text.sm, color: selected ? theme.accentText : theme.fg }}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: theme.hover, borderRadius: theme.radius.md, padding: 3 }}>
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <Pressable
            key={option.id}
            onPress={() => onChange(option.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={{
              flex: 1,
              height: 32,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: theme.radius.sm,
              backgroundColor: selected ? theme.surface : 'transparent',
              borderWidth: selected ? 1 : 0,
              borderColor: theme.border,
            }}
          >
            <Text
              numberOfLines={1}
              style={{ fontFamily: theme.font.medium, fontSize: theme.text.sm, color: selected ? theme.fg : theme.fgMuted }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Switch({ value, onChange, disabled, label }: { value: boolean; onChange: (value: boolean) => void; disabled?: boolean; label: string }) {
  const theme = useTheme();
  return (
    <NativeSwitch
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      accessibilityLabel={label}
      trackColor={{ false: theme.input, true: theme.accent }}
      thumbColor="#ffffff"
    />
  );
}

export function SettingRow({
  title,
  description,
  right,
  onPress,
}: {
  title: string;
  description?: string;
  right?: ReactNode;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="label">{title}</Txt>
        {description ? <Txt variant="caption">{description}</Txt> : null}
      </View>
      {right}
    </Pressable>
  );
}

export function RadioRow({ title, description, selected, onPress }: { title: string; description?: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, opacity: pressed ? 0.8 : 1 })}
    >
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          borderWidth: selected ? 5 : 1.5,
          borderColor: selected ? theme.accent : theme.borderStrong,
        }}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="label">{title}</Txt>
        {description ? <Txt variant="caption">{description}</Txt> : null}
      </View>
    </Pressable>
  );
}

export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="heading">{title}</Txt>
        {description ? <Txt variant="caption">{description}</Txt> : null}
      </View>
      {action}
    </View>
  );
}

export function EmptyState({
  icon = 'disc',
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24, gap: 10 }}>
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: theme.hover,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={22} color={theme.fgMuted} />
      </View>
      <Txt variant="heading" align="center">
        {title}
      </Txt>
      {body ? (
        <Txt variant="caption" align="center" style={{ maxWidth: 300 }}>
          {body}
        </Txt>
      ) : null}
      {onAction && actionLabel ? <Button label={actionLabel} variant="outline" size="sm" icon="refresh" onPress={onAction} /> : null}
    </View>
  );
}

export function Spinner({ size = 'small' }: { size?: 'small' | 'large' }) {
  const theme = useTheme();
  return <ActivityIndicator size={size} color={theme.accent} />;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export function Input({
  label,
  value,
  onChangeText,
  placeholder,
  secure,
  keyboardType,
  returnKeyType,
  onSubmitEditing,
  autoCapitalize = 'none',
  autoComplete,
  helper,
  leadingIcon,
  trailing,
  multiline,
  editable = true,
  monospace,
  maxLength,
  selection,
  onSelectionChange,
  autoFocus,
}: {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secure?: boolean;
  keyboardType?: KeyboardTypeOptions;
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmitEditing?: () => void;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoComplete?: 'email' | 'password' | 'username' | 'off' | 'new-password' | 'one-time-code' | 'name';
  helper?: string;
  leadingIcon?: IconName;
  trailing?: ReactNode;
  multiline?: boolean;
  editable?: boolean;
  monospace?: boolean;
  maxLength?: number;
  selection?: { start: number; end: number };
  onSelectionChange?: (selection: { start: number; end: number }) => void;
  autoFocus?: boolean;
}) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label ? <Txt variant="label">{label}</Txt> : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          gap: 8,
          minHeight: 44,
          paddingHorizontal: 12,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: focused ? theme.accent : theme.input,
          backgroundColor: theme.surface,
        }}
      >
        {leadingIcon ? <Icon name={leadingIcon} size={16} color={theme.fgMuted} /> : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.fgSubtle}
          secureTextEntry={secure}
          keyboardType={keyboardType}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          autoComplete={autoComplete}
          multiline={multiline}
          editable={editable}
          maxLength={maxLength}
          selection={selection}
          autoFocus={autoFocus}
          onSelectionChange={(event) => onSelectionChange?.(event.nativeEvent.selection)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          selectionColor={theme.accent}
          style={{
            flex: 1,
            color: theme.fg,
            fontFamily: monospace ? theme.font.mono : theme.font.regular,
            fontSize: monospace ? theme.text.lg : theme.text.base,
            letterSpacing: monospace ? 2 : 0,
            paddingVertical: multiline ? 10 : 8,
            minHeight: multiline ? 88 : undefined,
            textAlignVertical: multiline ? 'top' : 'center',
          }}
        />
        {trailing}
      </View>
      {helper ? <Txt variant="caption">{helper}</Txt> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Media primitives
// ---------------------------------------------------------------------------

export function Artwork({
  uri,
  size,
  radius,
  style,
  fallbackIcon = 'music',
}: {
  uri?: string | null;
  size?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  fallbackIcon?: IconName;
}) {
  const theme = useTheme();
  // Remember which URL failed, so a new URL automatically retries.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const shape: ViewStyle = {
    width: size,
    height: size,
    aspectRatio: size ? undefined : 1,
    borderRadius: radius ?? theme.radius.md,
    overflow: 'hidden',
    backgroundColor: theme.hover,
    alignItems: 'center',
    justifyContent: 'center',
  };
  return (
    <View style={[shape, style]}>
      {uri && failedUri !== uri ? (
        <Image
          source={{ uri }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          transition={160}
          cachePolicy="memory-disk"
          recyclingKey={uri}
          onError={() => setFailedUri(uri)}
        />
      ) : (
        <Icon name={fallbackIcon} size={size ? Math.max(16, size * 0.36) : 32} color={theme.fgSubtle} />
      )}
    </View>
  );
}

export function Avatar({ uri, initials, size = 36, ring }: { uri?: string | null; initials: string; size?: number; ring?: boolean }) {
  const theme = useTheme();
  const [failedUri, setFailedUri] = useState<string | null>(null);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        backgroundColor: theme.accent,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: ring ? 1.5 : 0,
        borderColor: theme.accent,
      }}
    >
      {uri && failedUri !== uri ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" onError={() => setFailedUri(uri)} />
      ) : (
        <Text style={{ color: theme.onAccent, fontFamily: theme.font.semibold, fontSize: Math.round(size * 0.36) }}>{initials}</Text>
      )}
    </View>
  );
}

/** Seek/volume slider: tap or drag anywhere on the track. */
export function Slider({
  value,
  max,
  onChange,
  onComplete,
  disabled,
  compact,
  label,
}: {
  value: number;
  max: number;
  onChange?: (value: number) => void;
  onComplete: (value: number) => void;
  disabled?: boolean;
  compact?: boolean;
  label: string;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [dragValue, setDragValue] = useState<number | null>(null);
  const valueAt = (x: number) => (width > 0 && max > 0 ? Math.min(Math.max(x / width, 0), 1) * max : 0);
  const update = (event: GestureResponderEvent) => {
    const next = valueAt(event.nativeEvent.locationX);
    setDragValue(next);
    onChange?.(next);
  };
  const shown = dragValue ?? value;
  const fraction = max > 0 ? Math.min(Math.max(shown / max, 0), 1) : 0;
  const trackHeight = compact ? 3 : 4;
  const thumb = compact ? (dragValue !== null ? 12 : 0) : dragValue !== null ? 16 : 12;
  const step = max / 20;
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: Math.round(max), now: Math.round(shown) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        const delta = event.nativeEvent.actionName === 'increment' ? step : -step;
        onComplete(Math.min(Math.max(value + delta, 0), max));
      }}
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => !disabled}
      onMoveShouldSetResponder={() => !disabled}
      onResponderTerminationRequest={() => false}
      onResponderGrant={update}
      onResponderMove={update}
      onResponderRelease={(event) => {
        const next = valueAt(event.nativeEvent.locationX);
        setDragValue(null);
        onComplete(next);
      }}
      onResponderTerminate={() => setDragValue(null)}
      style={{ height: compact ? 18 : 28, justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}
    >
      <View pointerEvents="none" style={{ height: trackHeight, borderRadius: trackHeight, backgroundColor: theme.input, overflow: 'hidden' }}>
        <View style={{ width: `${fraction * 100}%`, height: '100%', backgroundColor: theme.dark ? theme.fg : theme.accent }} />
      </View>
      {thumb > 0 ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: `${fraction * 100}%`,
            marginLeft: -thumb / 2,
            width: thumb,
            height: thumb,
            borderRadius: thumb / 2,
            backgroundColor: theme.dark ? theme.fg : theme.accent,
          }}
        />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Overlays
// ---------------------------------------------------------------------------

/**
 * Bottom sheet with a drag-to-dismiss handle. Android back, the backdrop, and a
 * downward drag animate it out before calling `onClose`.
 */
export function Sheet({
  visible,
  onClose,
  children,
  title,
  subtitle,
  fullHeight,
  headerRight,
  scroll = true,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  subtitle?: string;
  fullHeight?: boolean;
  headerRight?: ReactNode;
  scroll?: boolean;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [translate] = useState(() => new Animated.Value(height));
  const [backdrop] = useState(() => new Animated.Value(0));
  const [dragStartY, setDragStartY] = useState<number | null>(null);

  useEffect(() => {
    if (!visible) return;
    translate.setValue(height);
    backdrop.setValue(0);
    Animated.parallel([
      Animated.spring(translate, { toValue: 0, useNativeDriver: true, damping: 26, stiffness: 260, mass: 0.9 }),
      Animated.timing(backdrop, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [visible, height, translate, backdrop]);

  const requestClose = () => {
    Animated.parallel([
      Animated.timing(translate, { toValue: height, duration: 190, useNativeDriver: true }),
      Animated.timing(backdrop, { toValue: 0, duration: 190, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  if (!visible) return null;
  const body = scroll ? (
    <Animated.ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24, gap: 14 }}
    >
      {children}
    </Animated.ScrollView>
  ) : (
    <View style={{ flex: fullHeight ? 1 : undefined, paddingHorizontal: 20, paddingBottom: insets.bottom + 16 }}>{children}</View>
  );
  return (
    <Modal visible transparent statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={requestClose}>
      <Animated.View style={{ flex: 1, backgroundColor: theme.overlay, opacity: backdrop }}>
        <Pressable style={{ flex: 1 }} onPress={requestClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: height - insets.top - 12,
          height: fullHeight ? height - insets.top - 12 : undefined,
          backgroundColor: theme.elevated,
          borderTopLeftRadius: theme.radius.xl + 4,
          borderTopRightRadius: theme.radius.xl + 4,
          borderWidth: 1,
          borderBottomWidth: 0,
          borderColor: theme.border,
          transform: [{ translateY: translate }],
        }}
      >
        <View
          onStartShouldSetResponder={() => true}
          onResponderGrant={(event) => setDragStartY(event.nativeEvent.pageY)}
          onResponderMove={(event) => {
            if (dragStartY !== null) translate.setValue(Math.max(0, event.nativeEvent.pageY - dragStartY));
          }}
          onResponderRelease={(event) => {
            const dragged = dragStartY === null ? 0 : event.nativeEvent.pageY - dragStartY;
            setDragStartY(null);
            if (dragged > 110) requestClose();
            else Animated.spring(translate, { toValue: 0, useNativeDriver: true, damping: 24, stiffness: 260 }).start();
          }}
          style={{ paddingTop: 8, paddingBottom: title ? 12 : 8, paddingHorizontal: 20 }}
        >
          <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: theme.borderStrong, marginBottom: 12 }} />
          {title ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="title" lines={1}>
                  {title}
                </Txt>
                {subtitle ? (
                  <Txt variant="caption" lines={1}>
                    {subtitle}
                  </Txt>
                ) : null}
              </View>
              {headerRight}
            </View>
          ) : null}
        </View>
        {body}
      </Animated.View>
    </Modal>
  );
}

export function Dialog({
  visible,
  title,
  children,
  actions,
  onClose,
}: {
  visible: boolean;
  title: string;
  children?: ReactNode;
  actions: ReactNode;
  onClose: () => void;
}) {
  const theme = useTheme();
  if (!visible) return null;
  return (
    <Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.overlay, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={onClose} accessibilityLabel="Close" />
        <View
          style={{
            width: '100%',
            maxWidth: 420,
            backgroundColor: theme.elevated,
            borderRadius: theme.radius.xl,
            borderWidth: 1,
            borderColor: theme.border,
            padding: 20,
            gap: 14,
          }}
        >
          <Txt variant="title">{title}</Txt>
          {children}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>{actions}</View>
        </View>
      </View>
    </Modal>
  );
}
