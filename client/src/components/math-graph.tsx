import { useEffect, useRef, useState } from "react";

interface GraphFunction {
  fn: string;
  color?: string;
  label?: string;
}

interface MathGraphProps {
  functions: GraphFunction[];
  xDomain?: [number, number];
  yDomain?: [number, number];
  title?: string;
  grid?: boolean;
}

export function MathGraph({ functions, xDomain = [-10, 10], yDomain, title, grid = true }: MathGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || functions.length === 0) return;

    let mounted = true;

    const renderGraph = async () => {
      try {
        const functionPlot = (await import("function-plot")).default;

        if (!mounted || !containerRef.current) return;

        containerRef.current.innerHTML = "";

        const data = functions.map((f) => ({
          fn: f.fn,
          color: f.color || undefined,
          ...(f.label ? { title: f.label } : {}),
        }));

        const xMin = xDomain[0];
        const xMax = xDomain[1];
        const yMin = yDomain ? yDomain[0] : -Math.max(Math.abs(xMin), Math.abs(xMax));
        const yMax = yDomain ? yDomain[1] : Math.max(Math.abs(xMin), Math.abs(xMax));

        const centeredXDomain: [number, number] = [
          Math.min(xMin, -Math.abs(xMax)),
          Math.max(xMax, Math.abs(xMin)),
        ];
        const centeredYDomain: [number, number] = [
          Math.min(yMin, -Math.abs(yMax)),
          Math.max(yMax, Math.abs(yMin)),
        ];

        functionPlot({
          target: containerRef.current,
          width: containerRef.current.clientWidth || 500,
          height: 400,
          grid,
          xAxis: { domain: centeredXDomain, label: "x" },
          yAxis: { domain: centeredYDomain, label: "y" },
          data,
          tip: {
            xLine: true,
            yLine: true,
          },
        });

        setError(null);
      } catch (err: any) {
        if (mounted) {
          setError(`Could not render graph: ${err.message}`);
        }
      }
    };

    renderGraph();

    return () => {
      mounted = false;
    };
  }, [functions, xDomain, yDomain, grid]);

  if (error) {
    return (
      <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="my-4">
      {title && (
        <p className="text-sm font-semibold text-center text-slate-700 dark:text-slate-300 mb-2">{title}</p>
      )}
      <div
        ref={containerRef}
        className="w-full rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
        style={{ minHeight: 400 }}
        data-testid="math-graph"
      />
    </div>
  );
}

export function parseGraphBlock(code: string): MathGraphProps | null {
  try {
    const cleaned = code.trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed.functions || !Array.isArray(parsed.functions)) {
      if (parsed.fn) {
        return {
          functions: [{ fn: parsed.fn, label: parsed.label }],
          xDomain: parsed.xDomain || [-10, 10],
          yDomain: parsed.yDomain,
          title: parsed.title,
        };
      }
      return null;
    }

    return {
      functions: parsed.functions.map((f: any) => ({
        fn: typeof f === "string" ? f : f.fn,
        color: f.color,
        label: f.label,
      })),
      xDomain: parsed.xDomain || [-10, 10],
      yDomain: parsed.yDomain,
      title: parsed.title,
    };
  } catch {
    const fnMatch = code.trim().match(/(?:fn|function)\s*[:=]\s*["']?([^"'\n,}]+)/i);
    if (fnMatch) {
      return {
        functions: [{ fn: fnMatch[1].trim() }],
        xDomain: [-10, 10],
      };
    }
    return null;
  }
}
