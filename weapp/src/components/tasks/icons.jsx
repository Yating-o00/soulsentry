import { View, Text } from "@tarojs/components";

const base = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

export function IconClock({ size = 24, color = "#7b8277" }) {
  return (
    <View style={{ ...base, width: size, height: size }}>
      <Text style={{ fontSize: size * 0.85, color, lineHeight: `${size}px` }}>◷</Text>
    </View>
  );
}

export function IconMapPin({ size = 24, color = "#6e8a73" }) {
  return (
    <View style={{ ...base, width: size, height: size }}>
      <Text style={{ fontSize: size * 0.85, color, lineHeight: `${size}px` }}>◉</Text>
    </View>
  );
}

export function IconRepeat({ size = 20, color = "#7b8277" }) {
  return (
    <View style={{ ...base, width: size, height: size }}>
      <Text style={{ fontSize: size * 0.8, color, lineHeight: `${size}px` }}>↻</Text>
    </View>
  );
}

export function IconSparkles({ size = 22, color = "#6e8a73" }) {
  return (
    <View style={{ ...base, width: size, height: size }}>
      <Text style={{ fontSize: size * 0.85, color, lineHeight: `${size}px` }}>✦</Text>
    </View>
  );
}

export function IconBot({ size = 26, color = "#6e8a73" }) {
  return (
    <View style={{ ...base, width: size, height: size }}>
      <Text style={{ fontSize: size * 0.85, color, lineHeight: `${size}px` }}>◈</Text>
    </View>
  );
}

export function IconChevronRight({ size = 22, color = "#131712" }) {
  return (
    <View style={{ ...base, width: size, height: size }}>
      <Text style={{ fontSize: size * 0.75, color, lineHeight: `${size}px` }}>→</Text>
    </View>
  );
}

export function IconMic({ size = 36, color = "#7b8277" }) {
  return (
    <View style={{ ...base, width: size, height: size }}>
      <Text style={{ fontSize: size * 0.75, color, lineHeight: `${size}px` }}>🎤</Text>
    </View>
  );
}

export function IconArrowUp({ size = 28, color = "#fdfdf9" }) {
  return (
    <View style={{ ...base, width: size, height: size }}>
      <Text style={{ fontSize: size * 0.65, color, lineHeight: `${size}px` }}>↑</Text>
    </View>
  );
}

export function IconX({ size = 36, color = "#7b8277" }) {
  return (
    <View style={{ ...base, width: size, height: size }}>
      <Text style={{ fontSize: size * 0.6, color, lineHeight: `${size}px` }}>✕</Text>
    </View>
  );
}

export function IconSend({ size = 26, color = "#fdfdf9" }) {
  return (
    <View style={{ ...base, width: size, height: size }}>
      <Text style={{ fontSize: size * 0.65, color, lineHeight: `${size}px` }}>➤</Text>
    </View>
  );
}

export function IconPencil({ size = 26, color = "#3a3f36" }) {
  return (
    <View style={{ ...base, width: size, height: size }}>
      <Text style={{ fontSize: size * 0.7, color, lineHeight: `${size}px` }}>✎</Text>
    </View>
  );
}

export function IconUserCheck({ size = 26, color = "#3a3f36" }) {
  return (
    <View style={{ ...base, width: size, height: size }}>
      <Text style={{ fontSize: size * 0.7, color, lineHeight: `${size}px` }}>👤</Text>
    </View>
  );
}

export function IconCheck({ size = 20, color = "#fdfdf9" }) {
  return (
    <View style={{ ...base, width: size, height: size }}>
      <Text style={{ fontSize: size * 0.65, color, lineHeight: `${size}px` }}>✓</Text>
    </View>
  );
}

export function IconBrain({ size = 28, color = "#131712" }) {
  return (
    <View style={{ ...base, width: size, height: size }}>
      <Text style={{ fontSize: size * 0.75, color, lineHeight: `${size}px` }}>🧠</Text>
    </View>
  );
}

export function IconClock3({ size = 24, color = "rgba(19,23,18,0.55)" }) {
  return <IconClock size={size} color={color} />;
}

export function IconTrendingUp({ size = 24, color = "rgba(19,23,18,0.55)" }) {
  return (
    <View style={{ ...base, width: size, height: size }}>
      <Text style={{ fontSize: size * 0.75, color, lineHeight: `${size}px` }}>📈</Text>
    </View>
  );
}

export function IconMoonStar({ size = 24, color = "rgba(19,23,18,0.55)" }) {
  return (
    <View style={{ ...base, width: size, height: size }}>
      <Text style={{ fontSize: size * 0.75, color, lineHeight: `${size}px` }}>☽</Text>
    </View>
  );
}

export function IconLock({ size = 22, color = "rgba(19,23,18,0.55)" }) {
  return (
    <View style={{ ...base, width: size, height: size }}>
      <Text style={{ fontSize: size * 0.7, color, lineHeight: `${size}px` }}>🔒</Text>
    </View>
  );
}

export function IconSprout({ size = 28, color = "#131712" }) {
  return (
    <View style={{ ...base, width: size, height: size }}>
      <Text style={{ fontSize: size * 0.8, color, lineHeight: `${size}px` }}>🌱</Text>
    </View>
  );
}
