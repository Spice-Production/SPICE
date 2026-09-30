import { useEffect, useMemo, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SpiceController } from './src/state/controller';
import { AppShell } from './src/ui/AppShell';
import { ControllerProvider } from './src/ui/context';
import { useStoreSelector } from './src/state/store';
import { ThemeContext, buildTheme } from './src/ui/theme';

export default function App() {
  const [controller] = useState(() => new SpiceController());
  useEffect(() => {
    controller.start();
    return () => controller.stop();
  }, [controller]);
  const { accent, surface } = useStoreSelector(controller.store, (state) => ({
    accent: state.accentTheme,
    surface: state.surfaceTheme,
  }));
  const theme = useMemo(() => buildTheme(accent, surface), [accent, surface]);
  return (
    <SafeAreaProvider style={{ backgroundColor: theme.bg }}>
      <ThemeContext.Provider value={theme}>
        <ControllerProvider controller={controller}>
          <AppShell />
        </ControllerProvider>
      </ThemeContext.Provider>
    </SafeAreaProvider>
  );
}
