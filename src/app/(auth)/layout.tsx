import { Logo } from "@/components/ui/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center text-foreground">
          <Logo className="h-7 w-auto" />
        </div>
        {children}
      </div>
    </div>
  );
}
