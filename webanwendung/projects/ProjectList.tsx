import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Plus,
  Search,
  MoreHorizontal,
  Edit,
  Trash2,
  Eye,
  RefreshCw,
  XCircle,
  FileText,
  Users,
  CalendarClock,
  PlusCircle,
} from "lucide-react";
import { Project, PROJECT_STATUSES } from "@/types/project";
import { ProjectService } from "@/lib/services/projectService";
import { useAuth } from "@/lib/hooks/useAuth";
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useTranslation } from "react-i18next";

const ProjectList: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Zustandsvariablen
  const [projects, setProjects] = useState<Project[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Projekte aus der Datenbank laden
  useEffect(() => {
    loadProjects();
  }, []);

  // Projekte laden
  const loadProjects = async () => {
    try {
      setIsLoading(true);
      const data = await ProjectService.getAllProjects();
      setProjects(data);
      setFilteredProjects(data);
    } catch (error) {
      console.error("Fehler beim Laden der Projekte:", error);
      toast({
        title: "Fehler",
        description: "Die Projekte konnten nicht geladen werden.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Projekte aktualisieren
  const refreshProjects = async () => {
    try {
      setIsRefreshing(true);
      await loadProjects();
      toast({
        title: "Aktualisiert",
        description: "Die Projektliste wurde aktualisiert.",
      });
    } catch (error) {
      console.error("Fehler beim Aktualisieren der Projekte:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Suche nach Projekten
  useEffect(() => {
    if (searchTerm.trim() === "") {
      setFilteredProjects(projects);
    } else {
      const lowerCaseSearchTerm = searchTerm.toLowerCase();
      const filtered = projects.filter(
        (project) =>
          project.name.toLowerCase().includes(lowerCaseSearchTerm) ||
          project.projectNumber.toLowerCase().includes(lowerCaseSearchTerm) ||
          (project.customerName && project.customerName.toLowerCase().includes(lowerCaseSearchTerm)) ||
          (project.description &&
            project.description.toLowerCase().includes(lowerCaseSearchTerm))
      );
      setFilteredProjects(filtered);
    }
  }, [searchTerm, projects]);

  // Neues Projekt erstellen
  const handleCreateProject = () => {
    navigate("/projects/new");
  };

  // Projekt bearbeiten
  const handleEditProject = (id: string) => {
    navigate(`/projects/edit/${id}`);
  };

  // Projekt Details anzeigen
  const handleViewProject = (id: string) => {
    navigate(`/projects/view/${id}`);
  };

  // Projekt deaktivieren
  const handleDeactivateProject = async (id: string) => {
    try {
      await ProjectService.deactivateProject(id);
      
      // Projektliste aktualisieren
      setProjects(prevProjects =>
        prevProjects.map(project =>
          project.id === id ? { ...project, isActive: false } : project
        )
      );
      
      toast({
        title: "Projekt deaktiviert",
        description: "Das Projekt wurde erfolgreich deaktiviert.",
      });
    } catch (error) {
      console.error("Fehler beim Deaktivieren des Projekts:", error);
      toast({
        title: "Fehler",
        description: "Das Projekt konnte nicht deaktiviert werden.",
        variant: "destructive",
      });
    }
  };

  // Projekt aktivieren
  const handleActivateProject = async (id: string) => {
    try {
      await ProjectService.activateProject(id);
      
      // Projektliste aktualisieren
      setProjects(prevProjects =>
        prevProjects.map(project =>
          project.id === id ? { ...project, isActive: true } : project
        )
      );
      
      toast({
        title: "Projekt aktiviert",
        description: "Das Projekt wurde erfolgreich aktiviert.",
      });
    } catch (error) {
      console.error("Fehler beim Aktivieren des Projekts:", error);
      toast({
        title: "Fehler",
        description: "Das Projekt konnte nicht aktiviert werden.",
        variant: "destructive",
      });
    }
  };

  // Projekt löschen
  const handleDeleteProject = async (id: string) => {
    try {
      if (window.confirm("Möchten Sie dieses Projekt wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.")) {
        await ProjectService.deleteProject(id);
        
        // Projekt aus der Liste entfernen
        setProjects(prevProjects => prevProjects.filter(project => project.id !== id));
        setFilteredProjects(prevFilteredProjects => prevFilteredProjects.filter(project => project.id !== id));
        
        toast({
          title: "Projekt gelöscht",
          description: "Das Projekt wurde erfolgreich gelöscht.",
        });
      }
    } catch (error) {
      console.error("Fehler beim Löschen des Projekts:", error);
      toast({
        title: "Fehler",
        description: "Das Projekt konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    }
  };

  // Status-Badge Farbe ermitteln
  const getStatusBadge = (statusId: string) => {
    const status = Object.values(PROJECT_STATUSES).find(s => s.id === statusId);
    
    if (!status) return null;
    
    return (
      <Badge 
        variant="outline" 
        className={`bg-${status.color}-50 text-${status.color}-700 border-${status.color}-200`}
      >
        {status.name}
      </Badge>
    );
  };

  // Formatieren des Datums
  const formatDate = (date: Date | undefined) => {
    if (!date) return "-";
    return format(date, "d. MMM yyyy", { locale: de });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Projektverwaltung</h1>
        <Button
          className="flex items-center"
          onClick={() => navigate("/projects/new")}
        >
          <PlusCircle className="mr-2 h-4 w-4" />
          Neues Projekt erstellen
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl">Projektliste</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshProjects}
              disabled={isRefreshing}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`}
              />
              Aktualisieren
            </Button>
          </div>
          <div className="flex w-full max-w-sm items-center space-x-2 mt-4">
            <div className="relative w-full">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Suche nach Projekten oder Kunden..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center space-x-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-[250px]" />
                    <Skeleton className="h-4 w-[200px]" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground" />
              <h3 className="mt-4 text-lg font-medium">Keine Projekte gefunden</h3>
              <p className="text-muted-foreground mt-2">
                {searchTerm
                  ? "Es wurden keine Projekte gefunden, die Ihrer Suche entsprechen."
                  : "Es sind noch keine Projekte angelegt."}
              </p>
              {searchTerm && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setSearchTerm("")}
                >
                  Suche zurücksetzen
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Kunde</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Zeitraum</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProjects.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell>
                      <div className="font-medium">{project.name}</div>
                      <div className="text-xs text-muted-foreground">{project.projectNumber}</div>
                    </TableCell>
                    <TableCell>{project.customerName || "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        {getStatusBadge(project.status)}
                        {!project.isActive && (
                          <Badge variant="outline" className="ml-2 bg-gray-100 text-gray-500 border-gray-200">
                            Inaktiv
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center text-sm">
                        <CalendarClock className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                        <span>
                          {formatDate(project.startDate)}
                          {project.endDate ? ` - ${formatDate(project.endDate)}` : ""}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Menü öffnen</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleViewProject(project.id)}>
                            <Eye className="h-4 w-4 mr-2" />
                            Details anzeigen
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEditProject(project.id)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Bearbeiten
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {project.isActive ? (
                            <DropdownMenuItem onClick={() => handleDeactivateProject(project.id)}>
                              <XCircle className="h-4 w-4 mr-2 text-gray-500" />
                              Deaktivieren
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => handleActivateProject(project.id)}>
                              <RefreshCw className="h-4 w-4 mr-2 text-green-500" />
                              Aktivieren
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleDeleteProject(project.id)}>
                            <Trash2 className="h-4 w-4 mr-2 text-red-500" />
                            Löschen
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProjectList; 