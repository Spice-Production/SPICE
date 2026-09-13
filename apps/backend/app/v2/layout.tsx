import '../../components/ui/tokens.css';
import { Toaster } from '../../components/ui';

export default function V2Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
