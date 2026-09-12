import { Spinner } from "@/app/_components/Spinner";

export default function Loading() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Spinner size={48} className="text-violet" />
    </div>
  );
}
