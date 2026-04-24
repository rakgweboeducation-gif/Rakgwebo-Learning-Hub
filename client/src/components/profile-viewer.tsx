import { useState } from "react";
import { Dialog, DialogContent } from "../components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { cn } from "../../lib/utils";

interface TappableAvatarProps {
  src?: string | null;
  fallback: string;
  className?: string;
  name?: string;
  "data-testid"?: string;
}

export function TappableAvatar({ src, fallback, className, name, "data-testid": testId }: TappableAvatarProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Avatar
        className={cn("cursor-pointer ring-offset-background transition-all hover:ring-2 hover:ring-primary/50 hover:ring-offset-1", className)}
        onClick={(e) => {
          e.stopPropagation();
          if (src) setOpen(true);
        }}
        data-testid={testId}
      >
        <AvatarImage src={src || undefined} />
        <AvatarFallback>{fallback}</AvatarFallback>
      </Avatar>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md p-2 bg-background/95 backdrop-blur-sm" data-testid="dialog-avatar-preview">
          <div className="flex flex-col items-center gap-3 p-4">
            {name && <p className="text-lg font-semibold">{name}</p>}
            <img
              src={src || ""}
              alt={name || "Profile picture"}
              className="w-64 h-64 rounded-full object-cover border-4 border-muted shadow-lg"
              data-testid="img-avatar-preview"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface ExpandableBioProps {
  bio: string;
  clampLines?: number;
  className?: string;
  "data-testid"?: string;
}

export function ExpandableBio({ bio, clampLines = 2, className, "data-testid": testId }: ExpandableBioProps) {
  const [expanded, setExpanded] = useState(false);

  const needsExpansion = bio.length > 80 || bio.split("\n").length > clampLines;

  return (
    <div className={className} data-testid={testId}>
      <p
        className={cn(
          "text-sm text-muted-foreground whitespace-pre-wrap",
          !expanded && needsExpansion && (clampLines === 2 ? "line-clamp-2" : clampLines === 3 ? "line-clamp-3" : "line-clamp-2")
        )}
      >
        {bio}
      </p>
      {needsExpansion && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="text-xs text-primary hover:underline mt-0.5 font-medium"
          data-testid={testId ? `${testId}-toggle` : "button-toggle-bio"}
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}
