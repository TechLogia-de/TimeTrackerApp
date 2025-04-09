import React, { useState, useEffect } from "react";
import { ShiftTemplate } from "@/types/shifts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/components/ui/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { ShiftService } from "@/lib/services/shiftService";
import { Loader2, Plus, Pencil, Trash2, Clock } from "lucide-react";

// Zeitvalidierung Schema
const timeSchema = z.string().refine(
  (time) => {
    const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    return regex.test(time);
  },
  {
    message: "Gültige Zeit im Format HH:MM erforderlich",
  }
);

// Formular Schema
const templateFormSchema = z.object({
  title: z.string().min(1, "Titel ist erforderlich"),
  startTime: timeSchema,
  endTime: timeSchema,
  color: z.string().optional(),
  description: z.string().optional(),
});

// Zeit in 30-Minuten-Intervallen
const timeOptions = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const minute = i % 2 === 0 ? "00" : "30";
  return `${hour.toString().padStart(2, "0")}:${minute}`;
});

const colorOptions = [
  { value: "#e3f2fd", label: "Blau" },
  { value: "#e8f5e9", label: "Grün" },
  { value: "#f3e5f5", label: "Lila" },
  { value: "#fff8e1", label: "Gelb" },
  { value: "#ffebee", label: "Rot" },
  { value: "#e0f2f1", label: "Türkis" },
  { value: "#f1f8e9", label: "Hellgrün" },
];

interface ShiftTemplateManagerProps {
  initialTemplates?: ShiftTemplate[];
  onSave?: (templates: ShiftTemplate[]) => void;
}

const ShiftTemplateManager: React.FC<ShiftTemplateManagerProps> = ({
  initialTemplates = [],
  onSave,
}) => {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<ShiftTemplate[]>(initialTemplates);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [editingTemplate, setEditingTemplate] = useState<ShiftTemplate | null>(null);

  // Formular
  const form = useForm<z.infer<typeof templateFormSchema>>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      title: "",
      startTime: "09:00",
      endTime: "17:00",
      color: "#e3f2fd",
      description: "",
    },
  });

  // Lade Vorlagen beim Initialisieren
  useEffect(() => {
    if (initialTemplates.length === 0) {
      loadTemplates();
    }
  }, []);

  // Lade Vorlagen
  const loadTemplates = async () => {
    try {
      setIsLoading(true);
      const loadedTemplates = await ShiftService.getAllShiftTemplates();
      setTemplates(loadedTemplates);
    } catch (error) {
      console.error("Fehler beim Laden der Schichtvorlagen:", error);
      toast({
        title: "Fehler",
        description: "Die Schichtvorlagen konnten nicht geladen werden.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Dialog zum Erstellen/Bearbeiten öffnen
  const openTemplateDialog = (template?: ShiftTemplate) => {
    if (template) {
      form.reset({
        title: template.title,
        startTime: template.startTime,
        endTime: template.endTime,
        color: template.color || "#e3f2fd",
        description: template.description || "",
      });
      setEditingTemplate(template);
    } else {
      form.reset({
        title: "",
        startTime: "09:00",
        endTime: "17:00",
        color: "#e3f2fd",
        description: "",
      });
      setEditingTemplate(null);
    }
    setDialogOpen(true);
  };

  // Schließe Dialog
  const closeTemplateDialog = () => {
    setDialogOpen(false);
    setEditingTemplate(null);
  };

  // Vorlage speichern
  const saveTemplate = async (values: z.infer<typeof templateFormSchema>) => {
    try {
      setIsLoading(true);
      
      // Neue oder vorhandene Vorlage?
      const templateToSave: ShiftTemplate = {
        id: editingTemplate?.id || `template_${Date.now()}`,
        title: values.title,
        startTime: values.startTime,
        endTime: values.endTime,
        color: values.color,
        description: values.description,
      };
      
      // In der Datenbank speichern
      let savedTemplateId;
      if (editingTemplate) {
        // Update
        savedTemplateId = await ShiftService.saveShiftTemplate(templateToSave);
      } else {
        // Create new
        savedTemplateId = await ShiftService.saveShiftTemplate(templateToSave);
      }
      
      // Lokalen Zustand aktualisieren
      if (editingTemplate) {
        setTemplates(templates.map(t => 
          t.id === editingTemplate.id ? {...templateToSave, id: savedTemplateId} : t
        ));
      } else {
        setTemplates([...templates, {...templateToSave, id: savedTemplateId}]);
      }
      
      toast({
        title: "Erfolg",
        description: `Die Schichtvorlage "${values.title}" wurde erfolgreich ${editingTemplate ? 'aktualisiert' : 'erstellt'}.`,
      });
      
      // Dialog schließen
      closeTemplateDialog();
      
      // Callback ausführen
      if (onSave) {
        onSave(templates);
      }
    } catch (error) {
      console.error("Fehler beim Speichern der Schichtvorlage:", error);
      toast({
        title: "Fehler",
        description: "Die Schichtvorlage konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Vorlage löschen
  const deleteTemplate = async (templateId: string) => {
    if (!window.confirm("Sind Sie sicher, dass Sie diese Vorlage löschen möchten?")) {
      return;
    }
    
    try {
      setIsLoading(true);
      
      // Aus der Datenbank löschen
      await ShiftService.deleteShiftTemplate(templateId);
      
      // Aus lokalem Zustand entfernen
      setTemplates(templates.filter(t => t.id !== templateId));
      
      toast({
        title: "Erfolg",
        description: "Die Schichtvorlage wurde erfolgreich gelöscht.",
      });
      
      // Callback ausführen
      if (onSave) {
        onSave(templates.filter(t => t.id !== templateId));
      }
    } catch (error) {
      console.error("Fehler beim Löschen der Schichtvorlage:", error);
      toast({
        title: "Fehler",
        description: "Die Schichtvorlage konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {isLoading && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="bg-white p-4 rounded-md shadow-md flex items-center space-x-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span>Vorlagen werden geladen...</span>
          </div>
        </div>
      )}
      
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Schichtvorlagen</h2>
        <Button onClick={() => openTemplateDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          Neue Vorlage
        </Button>
      </div>
      
      {templates.length > 0 ? (
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableCaption>Liste aller Schichtvorlagen</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Farbe</TableHead>
                <TableHead>Titel</TableHead>
                <TableHead>Zeitraum</TableHead>
                <TableHead>Beschreibung</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((template) => (
                <TableRow key={template.id}>
                  <TableCell>
                    <div 
                      className="w-8 h-8 rounded" 
                      style={{ backgroundColor: template.color || '#e2e8f0' }}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{template.title}</TableCell>
                  <TableCell>
                    <div className="flex items-center">
                      <Clock className="h-4 w-4 mr-1 text-slate-400" />
                      {template.startTime} - {template.endTime}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[300px] truncate">
                    {template.description || "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => openTemplateDialog(template)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => deleteTemplate(template.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center p-8 bg-slate-50 rounded-md">
          <Clock className="h-12 w-12 mx-auto text-slate-400 mb-3" />
          <h3 className="text-lg font-medium mb-2">Keine Vorlagen vorhanden</h3>
          <p className="text-slate-500 mb-4">
            Sie haben noch keine Schichtvorlagen erstellt. Vorlagen erleichtern die Erstellung von wiederkehrenden Schichten.
          </p>
          <Button onClick={() => openTemplateDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            Erste Vorlage erstellen
          </Button>
        </div>
      )}
      
      {/* Dialog für das Erstellen/Bearbeiten von Vorlagen */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Schichtvorlage bearbeiten" : "Neue Schichtvorlage erstellen"}
            </DialogTitle>
            <DialogDescription>
              Schichtvorlagen können beim Erstellen neuer Schichten verwendet werden, um Zeit zu sparen.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(saveTemplate)} className="space-y-4">
              {/* Titel */}
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Titel</FormLabel>
                    <FormControl>
                      <Input placeholder="z.B. Frühschicht" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Startzeit */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Startzeit</FormLabel>
                      <FormControl>
                        <select 
                          className="w-full border border-input bg-background px-3 py-2 rounded-md"
                          {...field}
                        >
                          {timeOptions.map((time) => (
                            <option key={`start-${time}`} value={time}>
                              {time}
                            </option>
                          ))}
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Endzeit */}
                <FormField
                  control={form.control}
                  name="endTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Endzeit</FormLabel>
                      <FormControl>
                        <select 
                          className="w-full border border-input bg-background px-3 py-2 rounded-md"
                          {...field}
                        >
                          {timeOptions.map((time) => (
                            <option key={`end-${time}`} value={time}>
                              {time}
                            </option>
                          ))}
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              {/* Farbe */}
              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Farbe</FormLabel>
                    <div className="flex flex-wrap gap-2">
                      {colorOptions.map((color) => (
                        <div
                          key={color.value}
                          className={`
                            w-8 h-8 rounded-full cursor-pointer 
                            ${field.value === color.value ? 'ring-2 ring-primary ring-offset-2' : ''}
                          `}
                          style={{ backgroundColor: color.value }}
                          onClick={() => form.setValue('color', color.value)}
                        />
                      ))}
                    </div>
                    <FormDescription>
                      Diese Farbe wird für die Vorlage in der Übersicht verwendet.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Beschreibung */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Beschreibung</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Zusätzliche Informationen zur Vorlage"
                        className="resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button variant="outline" type="button" onClick={closeTemplateDialog}>
                  Abbrechen
                </Button>
                <Button type="submit">
                  {editingTemplate ? "Aktualisieren" : "Speichern"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ShiftTemplateManager; 