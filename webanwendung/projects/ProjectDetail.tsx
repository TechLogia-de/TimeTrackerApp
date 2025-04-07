import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { 
  Calendar as CalendarIcon, 
  Edit, 
  Trash2, 
  ArrowLeft, 
  Users, 
  MapPin, 
  Phone, 
  Mail,
  FileText,
  Clock,
  DollarSign,
  Tag
} from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { ProjectService } from "@/lib/services/projectService";
import { Project, PROJECT_STATUSES } from "@/types/project";
import { Button } from "@/components/ui/button";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CustomerService } from "@/lib/services/customerService";
import { Customer } from "@/types/customer";
import { mapsApi } from "@/lib/api";

const ProjectDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    if (!id) return;
    
    const loadProject = async () => {
      try {
        setIsLoading(true);
        const projectData = await ProjectService.getProjectById(id);
        setProject(projectData);
        
        // Kundendaten laden
        if (projectData.customerId) {
          const customerData = await CustomerService.getCustomerById(projectData.customerId);
          setCustomer(customerData);
        }
      } catch (error) {
        console.error("Fehler beim Laden der Projektdetails:", error);
        toast({
          title: "Fehler",
          description: "Die Projektdetails konnten nicht geladen werden.",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    loadProject();
  }, [id]);

  const handleEdit = () => {
    navigate(`/projects/edit/${id}`);
  };

  const handleDelete = async () => {
    if (!id) return;
    
    try {
      setIsDeleting(true);
      await ProjectService.deleteProject(id);
      toast({
        title: "Projekt gelöscht",
        description: "Das Projekt wurde erfolgreich gelöscht."
      });
      navigate("/projects");
    } catch (error) {
      console.error("Fehler beim Löschen des Projekts:", error);
      toast({
        title: "Fehler",
        description: "Das Projekt konnte nicht gelöscht werden.",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const formatDate = (date: Date | undefined) => {
    if (!date) return "-";
    return format(date, "d. MMMM yyyy", { locale: de });
  };

  const formatCurrency = (amount: number | undefined) => {
    if (amount === undefined) return "-";
    return new Intl.NumberFormat('de-DE', { 
      style: 'currency', 
      currency: 'EUR' 
    }).format(amount);
  };

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

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-64" />
          <div className="space-x-2">
            <Skeleton className="h-10 w-24 inline-block" />
            <Skeleton className="h-10 w-24 inline-block" />
          </div>
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40 mb-2" />
            <Skeleton className="h-4 w-full" />
          </CardHeader>
          <CardContent className="space-y-6">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-8">
        <FileText className="h-12 w-12 mx-auto text-muted-foreground" />
        <h3 className="mt-4 text-lg font-medium">Projekt nicht gefunden</h3>
        <p className="text-muted-foreground mt-2">
          Das angeforderte Projekt konnte nicht gefunden werden.
        </p>
        <Button className="mt-4" onClick={() => navigate("/projects")}>
          Zurück zur Projektliste
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <Button variant="outline" size="icon" onClick={() => navigate("/projects")} className="mr-4">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          {!project.isActive && (
            <Badge variant="outline" className="ml-4 bg-gray-100 text-gray-500 border-gray-200">
              Inaktiv
            </Badge>
          )}
          {getStatusBadge(project.status) && (
            <div className="ml-4">
              {getStatusBadge(project.status)}
            </div>
          )}
        </div>
        <div className="space-x-2">
          <Button variant="outline" onClick={handleEdit}>
            <Edit className="h-4 w-4 mr-2" />
            Bearbeiten
          </Button>
          <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
            <Trash2 className="h-4 w-4 mr-2" />
            Löschen
          </Button>
        </div>
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          {project.address && <TabsTrigger value="location">Standort</TabsTrigger>}
        </TabsList>
        
        <TabsContent value="details" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Projektinformationen</CardTitle>
              <CardDescription>Projektnummer: {project.projectNumber}</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Beschreibung</h3>
                  <p className="mt-1">
                    {project.description || "Keine Beschreibung vorhanden"}
                  </p>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Kunde</h3>
                  <p className="mt-1 font-medium">{project.client || "-"}</p>
                  {customer && (
                    <div className="mt-2 text-sm space-y-1">
                      {customer.email && (
                        <p className="flex items-center">
                          <Mail className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                          {customer.email}
                        </p>
                      )}
                      {customer.phone && (
                        <p className="flex items-center">
                          <Phone className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                          {customer.phone}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                
                {project.notes && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">Notizen</h3>
                    <p className="mt-1 whitespace-pre-line">{project.notes}</p>
                  </div>
                )}
              </div>
              
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Zeitraum</h3>
                  <div className="mt-1 space-y-1">
                    <p className="flex items-center">
                      <Clock className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                      {formatDate(project.startDate)}
                      {project.endDate ? ` - ${formatDate(project.endDate)}` : " (kein Enddatum)"}
                    </p>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Budget & Abrechnung</h3>
                  <div className="mt-1 space-y-1">
                    <p className="flex items-center">
                      <DollarSign className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                      Budget: {formatCurrency(project.budget)}
                    </p>
                    {project.hourlyRate !== undefined && (
                      <p className="flex items-center">
                        <DollarSign className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                        Stundensatz: {formatCurrency(project.hourlyRate)}
                      </p>
                    )}
                  </div>
                </div>
                
                {project.tags && project.tags.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">Tags</h3>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {project.tags.map((tag, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          <Tag className="h-3 w-3 mr-1" />
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Erstellungsdaten</h3>
                  <div className="mt-1 text-sm text-muted-foreground space-y-1">
                    {project.createdAt && (
                      <p>Erstellt am: {format(project.createdAt, "d. MMMM yyyy, HH:mm", { locale: de })} Uhr</p>
                    )}
                    {project.updatedAt && (
                      <p>Zuletzt aktualisiert: {format(project.updatedAt, "d. MMMM yyyy, HH:mm", { locale: de })} Uhr</p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {project.address && (
          <TabsContent value="location" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Projektstandort</CardTitle>
                <CardDescription className="flex items-center">
                  <MapPin className="h-4 w-4 mr-2 text-red-500" /> 
                  {project.address}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {project.latitude && project.longitude ? (
                  <div className="w-full h-96 relative rounded-md overflow-hidden">
                    <img
                      src={mapsApi.getStaticMapUrl(
                        project.latitude,
                        project.longitude,
                        14,
                        1200,
                        600
                      )}
                      alt="Standort Karte"
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        console.error("Fehler beim Laden der Karte:", e);
                        const target = e.target as HTMLImageElement;
                        target.onerror = null;
                        target.src = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%221200%22%20height%3D%22600%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%221200%22%20height%3D%22600%22%20fill%3D%22%23eee%22%2F%3E%3Ctext%20x%3D%22600%22%20y%3D%22300%22%20font-family%3D%22sans-serif%22%20font-size%3D%2220%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20fill%3D%22%23999%22%3EKartenbild konnte nicht geladen werden%3C%2Ftext%3E%3C%2Fsvg%3E';
                      }}
                    />
                    <div className="absolute bottom-4 right-4">
                      <div className="bg-white py-2 px-4 rounded-md shadow-md">
                        <p className="text-sm font-medium">Diese Kartendaten werden bei der Auftragserstellung automatisch übernommen</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <MapPin className="h-12 w-12 mx-auto text-muted-foreground" />
                    <p className="mt-4 text-muted-foreground">
                      Keine Koordinaten verfügbar für die Kartenanzeige.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Löschdialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Projekt löschen</DialogTitle>
            <DialogDescription>
              Möchten Sie das Projekt "{project.name}" wirklich löschen?
              Diese Aktion kann nicht rückgängig gemacht werden.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowDeleteDialog(false)}
              disabled={isDeleting}
            >
              Abbrechen
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Wird gelöscht..." : "Löschen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProjectDetail; 