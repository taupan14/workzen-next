export default function Loading() {
  return (
    <div className="animate-pulse space-y-8" aria-hidden>
      <div className="h-9 w-48 rounded-md bg-rule" />
      <div className="h-20 rounded-lg bg-rule/60" />
      <div className="space-y-2">
        <div className="h-14 rounded-md bg-rule/60" />
        <div className="h-14 rounded-md bg-rule/60" />
        <div className="h-14 rounded-md bg-rule/60" />
      </div>
    </div>
  );
}
