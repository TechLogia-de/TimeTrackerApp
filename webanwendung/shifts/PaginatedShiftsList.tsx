import React, { useState, useEffect } from "react";
import { Shift, ShiftAssignment } from "@/types/shifts";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { 
  CalendarIcon, 
  Clock, 
  ChevronLeft, 
  ChevronRight, 
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  Users
} from "lucide-react";

interface PaginatedShiftsListProps {
  shifts: Shift[];
  title?: string;
  description?: string;
  pageSize?: number;
  onEdit?: (shift: Shift) => void;
  onDelete?: (shiftId: string) => void;
  onAccept?: (shiftId: string) => void;
  onDecline?: (shiftId: string) => void;
  role?: "admin" | "manager" | "employee";
  userId?: string;
  filterStatus?: string;
  showFilters?: boolean;
}

const PaginatedShiftsList: React.FC<PaginatedShiftsListProps> = ({
  shifts,
  title = "Schichten",
  description,
  pageSize = 10,
  onEdit,
  onDelete,
  onAccept,
  onDecline,
  role = "employee",
  userId,
  filterStatus = "all",
  showFilters = true,
}) => {
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [filteredShifts, setFilteredShifts] = useState<Shift[]>(shifts);
  const [filter, setFilter] = useState<string>(filterStatus);
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Berechne Paginierungsinformationen
  const totalItems = filteredShifts.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const currentItems = filteredShifts.slice(startIndex, endIndex);

  // Filter anwenden, wenn sich die Props ändern
  useEffect(() => {
    applyFilters();
  }, [shifts, filter, searchTerm]);

  // Filterung anwenden
  const applyFilters = () => {
    let result = [...shifts];

    // Nach Status filtern
    if (filter !== "all") {
      result = result.filter(shift => {
        if (userId) {
          const userAssignment = shift.assignedUsers.find(u => u.userId === userId);
          if (userAssignment) {
            return userAssignment.status === filter;
          }
          return false;
        } else if (filter === "unassigned") {
          return shift.assignedUsers.length === 0;
        } else {
          return shift.assignedUsers.some(user => user.status === filter);
        }
      });
    }

    // Nach Suchbegriff filtern
    if (searchTerm.trim() !== "") {
      const term = searchTerm.toLowerCase();
      result = result.filter(shift => 
        shift.title.toLowerCase().includes(term) ||
        shift.date.includes(term) ||
        shift.assignedUsers.some(u => u.userName.toLowerCase().includes(term))
      );
    }

    // Nach Datum sortieren (neueste zuerst)
    result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    setFilteredShifts(result);
    setCurrentPage(1); // Zurück zur ersten Seite nach Filteränderung
  };

  // Seite wechseln
  const changePage = (page: number) => {
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    setCurrentPage(page);
  };

  // Status-Badge für Benutzer anzeigen
  const renderStatusBadge = (status: ShiftAssignment["status"]) => {
    switch (status) {
      case "accepted":
        return (
          <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">
            Akzeptiert
          </span>
        );
      case "declined":
        return (
          <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-medium">
            Abgelehnt
          </span>
        );
      case "pending":
        return (
          <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs font-medium">
            Ausstehend
          </span>
        );
      case "assigned":
        return (
          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">
            Zugewiesen
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}

        {showFilters && (
          <div className="flex flex-col sm:flex-row gap-2 mt-4">
            <Input
              placeholder="Suchen..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-xs"
            />
            
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="max-w-xs">
                <SelectValue placeholder="Status Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Schichten</SelectItem>
                <SelectItem value="assigned">Zugewiesen</SelectItem>
                <SelectItem value="accepted">Akzeptiert</SelectItem>
                <SelectItem value="declined">Abgelehnt</SelectItem>
                <SelectItem value="pending">Ausstehend</SelectItem>
                {(role === "admin" || role === "manager") && (
                  <SelectItem value="unassigned">Nicht zugewiesen</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        )}
      </CardHeader>

      <CardContent>
        {currentItems.length === 0 ? (
          <div className="text-center py-4 text-slate-500">
            Keine Schichten gefunden.
          </div>
        ) : (
          <div className="space-y-3">
            {currentItems.map((shift) => {
              // Benutzerbezogener Status bestimmen
              let userStatus: ShiftAssignment["status"] | null = null;
              let userAssignment: ShiftAssignment | undefined;
              
              if (userId) {
                userAssignment = shift.assignedUsers.find(u => u.userId === userId);
                if (userAssignment) {
                  userStatus = userAssignment.status;
                }
              }
              
              return (
                <div 
                  key={shift.id} 
                  className="border rounded-md p-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex justify-between">
                    <div>
                      <h3 className="font-medium">{shift.title}</h3>
                      <div className="text-sm flex items-center mt-1 text-slate-500">
                        <CalendarIcon className="h-3 w-3 mr-1" />
                        {format(new Date(shift.date), "EEEE, d. MMMM yyyy", { locale: de })}
                      </div>
                      <div className="text-sm flex items-center mt-1 text-slate-500">
                        <Clock className="h-3 w-3 mr-1" />
                        {shift.startTime} - {shift.endTime}
                      </div>
                      
                      {/* Zugewiesene Mitarbeiter (für Admin/Manager) */}
                      {(role === "admin" || role === "manager") && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {shift.assignedUsers.length > 0 ? (
                            <div className="text-xs flex items-center text-slate-500">
                              <Users className="h-3 w-3 mr-1" />
                              {shift.assignedUsers.length} {shift.assignedUsers.length === 1 ? "Mitarbeiter" : "Mitarbeiter"}
                            </div>
                          ) : (
                            <div className="text-xs text-orange-500">
                              Keine Mitarbeiter zugewiesen
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Status für Mitarbeiter */}
                      {userId && userStatus && (
                        <div className="mt-2">
                          {renderStatusBadge(userStatus)}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      {/* Aktionsbuttons basierend auf Rolle */}
                      {(role === "admin" || role === "manager") && (
                        <>
                          {onEdit && (
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => onEdit(shift)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          )}
                          
                          {onDelete && (
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => {
                                if (window.confirm("Sind Sie sicher, dass Sie diese Schicht löschen möchten?")) {
                                  onDelete(shift.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          )}
                        </>
                      )}
                      
                      {/* Akzeptieren/Ablehnen für Mitarbeiter */}
                      {role === "employee" && userId && userStatus === "assigned" && (
                        <div className="flex gap-1">
                          {onAccept && (
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => onAccept(shift.id)}
                            >
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            </Button>
                          )}
                          
                          {onDecline && (
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => onDecline(shift.id)}
                            >
                              <XCircle className="h-4 w-4 text-red-500" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {totalPages > 1 && (
        <CardFooter className="flex justify-between items-center">
          <div className="text-sm text-slate-500">
            {startIndex + 1}-{endIndex} von {totalItems} Schichten
          </div>
          
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => changePage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <div className="text-sm">
              Seite {currentPage} von {totalPages}
            </div>
            
            <Button
              variant="outline"
              size="icon"
              onClick={() => changePage(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardFooter>
      )}
    </Card>
  );
};

export default PaginatedShiftsList; 