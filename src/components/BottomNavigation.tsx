
import { House, Search, Plus, Bell, User } from "lucide-react";

const BottomNavigation = () => {
  const navItems = [
    { icon: House, isActive: true },
    { icon: Search, isActive: false },
    { icon: Plus, isActive: false },
    { icon: Bell, isActive: false },
    { icon: User, isActive: false },
  ];

  return (
    <div>
      <div className="flex gap-2 border-t border-[#f0f2f4] bg-white px-4 pb-3 pt-2">
        {navItems.map((item, index) => (
          <a
            key={index}
            className={`flex flex-1 flex-col items-center justify-end gap-1 rounded-full transition-colors hover:bg-gray-50 py-2 ${
              item.isActive ? "text-[#111418]" : "text-[#637488]"
            }`}
            href="#"
          >
            <div className="flex h-8 items-center justify-center">
              <item.icon 
                size={24} 
                fill={item.isActive ? "currentColor" : "none"}
                stroke={item.isActive ? "currentColor" : "currentColor"}
              />
            </div>
          </a>
        ))}
      </div>
      <div className="h-5 bg-white"></div>
    </div>
  );
};

export default BottomNavigation;
