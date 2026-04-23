import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

const EMOJI_CATEGORIES = [
  {
    name: "Smileys",
    emojis: ["😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩","😘","😗","😚","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🤐","🤨","😐","😑","😶","😏","😒","🙄","😬","🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤮","🥵","🥶","🥴","😵","🤯","🤠","🥳","🥸","😎","🤓","🧐"]
  },
  {
    name: "Gestures",
    emojis: ["👋","🤚","🖐️","✋","🖖","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","✍️","💪","🦾","🦿"]
  },
  {
    name: "Hearts",
    emojis: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❤️‍🔥","❤️‍🩹","💕","💞","💓","💗","💖","💘","💝","💟"]
  },
  {
    name: "Objects",
    emojis: ["📚","📖","📝","✏️","📐","📏","🔢","➕","➖","✖️","➗","🟰","📊","📈","💡","🔬","🔭","💻","🎓","🏫","✅","❌","❓","❗","⭐","🎯","🏆","🔔","📌","📎","💯"]
  },
  {
    name: "Math",
    emojis: ["🔢","0️⃣","1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟","➕","➖","✖️","➗","🟰","▶️","⏸️","⏹️","⏺️","⏏️","🔀","🔁","🔂","◀️","🔼","🔽","⏩","⏪","⏫","⏬","🔃","🔄"]
  }
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
}

export function EmojiPicker({ onSelect }: EmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState(0);

  return (
    <div className="w-72 bg-background border rounded-lg shadow-lg" data-testid="emoji-picker">
      <div className="flex border-b overflow-x-auto">
        {EMOJI_CATEGORIES.map((cat, i) => (
          <button
            key={cat.name}
            className={`px-3 py-1.5 text-xs whitespace-nowrap ${activeCategory === i ? "border-b-2 border-primary font-medium" : "text-muted-foreground"}`}
            onClick={() => setActiveCategory(i)}
            data-testid={`emoji-tab-${cat.name.toLowerCase()}`}
          >
            {cat.name}
          </button>
        ))}
      </div>
      <ScrollArea className="h-48 p-2">
        <div className="grid grid-cols-8 gap-0.5">
          {EMOJI_CATEGORIES[activeCategory].emojis.map((emoji, i) => (
            <button
              key={`${emoji}-${i}`}
              className="w-8 h-8 flex items-center justify-center text-lg hover-elevate rounded-md"
              onClick={() => onSelect(emoji)}
              data-testid={`emoji-${i}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
