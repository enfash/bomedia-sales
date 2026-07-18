import { View, Text, Pressable, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import { useRouter, useSegments, Link } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function DesktopSidebar() {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  
  const isDesktop = width > 768;

  if (!isDesktop) {
    return null;
  }

  // Determine current active route from segments
  const currentRoute = segments[0] || 'index';

  const menuItems = [
    { name: 'index', label: 'Home', icon: 'home' },
    { name: 'quote', label: 'Quote', icon: 'file-text' },
    { name: 'new-sales', label: 'New Sale', icon: 'plus-circle' },
    { name: 'board', label: 'Job Board', icon: 'layout' },
    { name: 'records', label: 'Records', icon: 'archive' },
    { name: 'clients', label: 'Clients', icon: 'users' },
    { name: 'expenses', label: 'Expenses', icon: 'dollar-sign' },
    { name: 'settings', label: 'Settings', icon: 'settings' },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
      <View style={styles.header}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoText}>B</Text>
        </View>
        <Text style={styles.brandName}>BOmedia</Text>
      </View>
      
      <View style={styles.navContainer}>
        {menuItems.map((item) => {
          // 'index' segment is usually an empty string for the root route in segments
          // but let's be careful. If segments is empty, we are at index.
          const isActive = (!segments[0] && item.name === 'index') || segments[0] === item.name;
          const href = item.name === 'index' ? '/' : `/${item.name}`;

          return (
            <Link key={item.name} href={href as any} asChild>
              <Pressable style={StyleSheet.flatten([styles.navItem, isActive && styles.navItemActive])}>
                <Feather name={item.icon as any} size={20} color={isActive ? '#ffffff' : 'rgba(255,255,255,0.7)'} />
                <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>{item.label}</Text>
              </Pressable>
            </Link>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 260,
    backgroundColor: '#2e388d', // Corporate Blue
    height: '100%',
    paddingHorizontal: 16,
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
    ...(Platform.OS === 'web' ? { position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 100 } : {}),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 40,
    paddingHorizontal: 8,
  },
  logoCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  logoText: {
    color: '#2e388d',
    fontWeight: 'bold',
    fontSize: 18,
  },
  brandName: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  navContainer: {
    gap: 8,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 12,
  },
  navItemActive: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  navLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    fontWeight: '500',
  },
  navLabelActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
});
