import { useState } from "react";
import { useLocation } from "wouter";
import { useTextbooks } from "../hooks/use-modules";
import { Card, CardContent, CardFooter } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { BookOpen, Search, Filter } from "lucide-react";
import { Badge } from "../components/ui/badge";

export default function TextbooksPage() {
  const [, navigate] = useLocation();
  const { data: textbooks, isLoading } = useTextbooks();
  const [search, setSearch] = useState("");
  const [selectedGrade, setSelectedGrade] = useState<number | null>(null);

  const filteredTextbooks = textbooks?.filter(book => {
    const matchesSearch = book.title.toLowerCase().includes(search.toLowerCase());
    const matchesGrade = selectedGrade ? book.grade === selectedGrade : true;
    return matchesSearch && matchesGrade;
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Textbooks</h1>
          <p className="text-muted-foreground">Access your curriculum materials and resources.</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search textbooks..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant="outline" size="icon">
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex gap-2 pb-2 overflow-x-auto scrollbar-hide">
        <Badge 
          variant={selectedGrade === null ? "default" : "outline"} 
          className="cursor-pointer px-4 py-1.5"
          onClick={() => setSelectedGrade(null)}
        >
          All Grades
        </Badge>
        {Array.from(new Set(textbooks?.map(b => b.grade) || [])).sort((a, b) => a - b).map(grade => (
          <Badge
            key={grade}
            variant={selectedGrade === grade ? "default" : "outline"}
            className="cursor-pointer px-4 py-1.5 whitespace-nowrap"
            onClick={() => setSelectedGrade(grade)}
            data-testid={`badge-grade-${grade}`}
          >
            Grade {grade}
          </Badge>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-80 rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredTextbooks?.map((book) => (
            <Card key={book.id} className="group overflow-hidden border-slate-200 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <div className="aspect-[3/4] bg-slate-100 relative overflow-hidden">
                {book.coverUrl ? (
                  <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-50">
                    <BookOpen className="w-16 h-16 mb-2 opacity-20" />
                    <span className="text-sm font-medium opacity-50">No Cover</span>
                  </div>
                )}
                <div className="absolute top-2 right-2">
                  <Badge variant="secondary" className="bg-white/90 backdrop-blur shadow-sm">Grade {book.grade}</Badge>
                </div>
              </div>
              <CardContent className="p-4">
                <h3 className="font-bold text-lg leading-tight mb-2 group-hover:text-primary transition-colors line-clamp-2">
                  {book.title}
                </h3>
              </CardContent>
              <CardFooter className="p-4 pt-0">
                <Button className="w-full" onClick={() => navigate(`/textbooks/${book.id}`)} data-testid={`button-read-textbook-${book.id}`}>Read Now</Button>
              </CardFooter>
            </Card>
          ))}
          
          {filteredTextbooks?.length === 0 && (
            <div className="col-span-full py-12 text-center text-muted-foreground">
              <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>No textbooks found matching your criteria.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
