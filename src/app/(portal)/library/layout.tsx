/** Output library (nav v3): each page brings its own header (the library, an output's page). */
export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-6">{children}</div>;
}
