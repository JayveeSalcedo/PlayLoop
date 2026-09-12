import { Spinner } from "@/app/_components/Spinner";

export default function Loading() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <Spinner size={48} />
    </div>
  );
}
