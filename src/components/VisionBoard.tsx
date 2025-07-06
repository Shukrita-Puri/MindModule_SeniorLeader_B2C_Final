
import { useState, useRef } from "react";
import { Upload, Plus, X, Edit3, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VisionItem {
  id: string;
  type: "image" | "text";
  content: string;
  category: "mindset" | "career" | "relationships" | "health" | "lifestyle";
  position: { x: number; y: number };
}

const VisionBoard = () => {
  const [items, setItems] = useState<VisionItem[]>([
    {
      id: "1",
      type: "text",
      content: "Lead with confidence",
      category: "mindset",
      position: { x: 50, y: 40 }
    },
    {
      id: "2",
      type: "text",
      content: "C-Suite Executive",
      category: "career",
      position: { x: 300, y: 120 }
    }
  ]);

  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const categories = [
    { id: "mindset", name: "Mindset", color: "bg-purple-100 text-purple-800", border: "border-purple-300" },
    { id: "career", name: "Career", color: "bg-blue-100 text-blue-800", border: "border-blue-300" },
    { id: "relationships", name: "Relationships", color: "bg-pink-100 text-pink-800", border: "border-pink-300" },
    { id: "health", name: "Health", color: "bg-green-100 text-green-800", border: "border-green-300" },
    { id: "lifestyle", name: "Lifestyle", color: "bg-yellow-100 text-yellow-800", border: "border-yellow-300" }
  ];

  const addTextItem = (category: string) => {
    const text = prompt(`Add a ${category} goal:`);
    if (text) {
      const newItem: VisionItem = {
        id: Date.now().toString(),
        type: "text",
        content: text,
        category: category as any,
        position: { x: Math.random() * 250 + 50, y: Math.random() * 150 + 50 }
      };
      setItems(prev => [...prev, newItem]);
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const newItem: VisionItem = {
          id: Date.now().toString(),
          type: "image",
          content: e.target?.result as string,
          category: "lifestyle",
          position: { x: Math.random() * 250 + 50, y: Math.random() * 150 + 50 }
        };
        setItems(prev => [...prev, newItem]);
      };
      reader.readAsDataURL(file);
    }
  };

  const deleteItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const startEditing = (item: VisionItem) => {
    if (item.type === "text") {
      setEditingItem(item.id);
      setEditText(item.content);
    }
  };

  const saveEdit = () => {
    if (editingItem && editText.trim()) {
      setItems(prev => prev.map(item => 
        item.id === editingItem ? { ...item, content: editText.trim() } : item
      ));
    }
    setEditingItem(null);
    setEditText("");
  };

  const moveItem = (id: string, newPosition: { x: number; y: number }) => {
    setItems(prev => prev.map(item => 
      item.id === id ? { ...item, position: newPosition } : item
    ));
  };

  return (
    <div className="border-2 border-gray-200 rounded-xl p-6 bg-white shadow-lg">
      <div className="mb-6">
        <h4 className="text-xl font-bold text-gray-800 mb-4">Create Your Vision Board</h4>
        
        {/* Category Buttons */}
        <div className="flex flex-wrap gap-3 mb-4">
          {categories.map((category) => (
            <Button
              key={category.id}
              size="sm"
              variant="outline"
              className={`${category.color} ${category.border} hover:opacity-80`}
              onClick={() => addTextItem(category.id)}
            >
              <Plus size={14} className="mr-1" />
              {category.name}
            </Button>
          ))}
          
          <Button 
            size="sm" 
            variant="outline" 
            className="border-gray-300 hover:bg-gray-50"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={14} className="mr-1" />
            Upload Image
          </Button>
          
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
        </div>
      </div>

      {/* Vision Board Canvas */}
      <div className="relative h-96 border-2 border-dashed border-gray-300 rounded-lg overflow-hidden bg-gradient-to-br from-gray-50 to-white">
        {items.map((item) => {
          const category = categories.find(c => c.id === item.category);
          return (
            <div
              key={item.id}
              className="absolute cursor-move hover:shadow-lg transition-all duration-200 group"
              style={{ 
                left: `${item.position.x}px`, 
                top: `${item.position.y}px`,
                maxWidth: '180px'
              }}
              onMouseDown={(e) => {
                const startX = e.clientX - item.position.x;
                const startY = e.clientY - item.position.y;
                
                const handleMouseMove = (e: MouseEvent) => {
                  const newX = Math.max(0, Math.min(e.clientX - startX, 400));
                  const newY = Math.max(0, Math.min(e.clientY - startY, 300));
                  moveItem(item.id, { x: newX, y: newY });
                };
                
                const handleMouseUp = () => {
                  document.removeEventListener('mousemove', handleMouseMove);
                  document.removeEventListener('mouseup', handleMouseUp);
                };
                
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
              }}
            >
              <div className="bg-white rounded-lg shadow-md border-2 border-gray-200 p-3 min-h-[80px] relative">
                {/* Item Controls */}
                <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  {item.type === "text" && (
                    <button
                      onClick={() => startEditing(item)}
                      className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-blue-600"
                    >
                      <Edit3 size={12} />
                    </button>
                  )}
                  <button
                    onClick={() => deleteItem(item.id)}
                    className="w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                  >
                    <X size={12} />
                  </button>
                </div>

                {/* Item Content */}
                {item.type === "text" ? (
                  editingItem === item.id ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="w-full p-1 text-sm border border-gray-300 rounded"
                        autoFocus
                      />
                      <button
                        onClick={saveEdit}
                        className="w-full text-xs bg-green-500 text-white py-1 rounded flex items-center justify-center gap-1"
                      >
                        <Save size={10} />
                        Save
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm font-medium text-gray-800 leading-tight">{item.content}</p>
                  )
                ) : (
                  <img src={item.content} alt="Vision" className="w-full h-16 object-cover rounded" />
                )}
                
                {/* Category Tag */}
                <div className={`text-xs px-2 py-1 rounded-full mt-2 ${category?.color} inline-block`}>
                  {item.category}
                </div>
              </div>
            </div>
          );
        })}
        
        {items.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <p className="mb-2 text-lg">Your vision board awaits</p>
              <p className="text-sm">Click on a category above to add your first vision item</p>
            </div>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            ✨ {items.length} vision {items.length === 1 ? 'item' : 'items'} added. Drag to reposition, hover to edit or delete.
          </p>
        </div>
      )}
    </div>
  );
};

export default VisionBoard;
