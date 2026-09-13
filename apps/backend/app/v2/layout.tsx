import '../../components/ui/tokens.css';
import { Toaster } from '../../components/ui';
import { PlayerProvider, V2Shell } from './shell';

export default function V2Layout({ children }: { children: React.ReactNode }) {
  return (
    <PlayerProvider>
      <V2Shell>{children}</V2Shell>
      <Toaster />
    </PlayerProvider>
  );
}
