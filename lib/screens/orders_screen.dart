import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/order_service.dart';
import '../models/order_model.dart' hide Order;  // Hier verstecken wir Order aus Firebase
import '../models/order_model.dart' as app_models;  // Importiere Order als app_models.Order
import '../services/navigation_service.dart';
import '../services/auth_service.dart';
import '../widgets/navigation/bottom_nav_bar.dart';
import '../widgets/navigation/app_bar.dart';
import '../widgets/dialogs/timer_dialogs.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'dart:async';
import '../widgets/maps/order_map_widget.dart';
import 'package:cloud_firestore/cloud_firestore.dart' as fb_store;

class OrdersScreen extends StatefulWidget {
  final User user;
  
  const OrdersScreen({Key? key, required this.user}) : super(key: key);

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> with SingleTickerProviderStateMixin, AutomaticKeepAliveClientMixin {
  final OrderService _orderService = OrderService();
  final NavigationService _navigationService = NavigationService();
  final AuthService _authService = AuthService();
  
  OrderStatus? _statusFilter;
  String? _searchQuery;
  String? _customerFilter;
  String? _projectFilter;
  late TabController _tabController;
  String _viewMode = "all"; // all, team, my
  bool isManager = false;
  bool isAdmin = false;
  
  // Zusätzliche Variablen für das vereinfachte Layout
  bool _isLoading = true;
  List<app_models.Order> _filteredOrders = [];
  
  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _tabController.addListener(_handleTabChange);
    
    // Prüfe Benutzerrechte
    _checkUserRoles();
    
    // DIAGNOSE: Überprüfe Firestore-Verbindung
    _runDatabaseDiagnostics();
    
    // Lade Aufträge
    _loadOrders();
  }
  
  @override
  void dispose() {
    _tabController.removeListener(_handleTabChange);
    _tabController.dispose();
    super.dispose();
  }
  
  void _checkUserRoles() async {
    // In einer echten App würde hier eine Abfrage zur Datenbank gemacht werden
    // Für diese Demo verwenden wir die Email als einfachen Indikator
    final userEmail = widget.user.email?.toLowerCase() ?? '';
    setState(() {
      isManager = userEmail.contains('manager') || userEmail.contains('admin');
      isAdmin = userEmail.contains('admin');
    });
  }
  
  void _handleTabChange() {
    if (!_tabController.indexIsChanging) {
      setState(() {
        switch(_tabController.index) {
          case 0:
            _viewMode = "all";
            break;
          case 1:
            _viewMode = "team";
            break;
          case 2:
            _viewMode = "my";
            break;
        }
        // Status-Filter zurücksetzen
        _statusFilter = null;
      });
    }
  }
  
  // Methode zum Laden der Aufträge
  Future<void> _loadOrders() async {
    setState(() {
      _isLoading = true;
    });
    
    try {
      // Warte kurz für die Animation
      await Future.delayed(Duration(milliseconds: 300));
      
      print("🔄 Starte _loadOrders mit zusätzlichem Fallback-Mechanismus");
      
      bool streamLoaded = false;
      List<app_models.Order> orders = [];
      
      // Erster Versuch: Versuche die Aufträge über den Stream zu laden
      try {
        print("⚙️ Versuch 1: Lade Aufträge über Stream-Methode");
        
        // Da Streams asynchron sind, benötigen wir einen Future-Wrapper
        final completer = Completer<List<app_models.Order>>();
        late StreamSubscription subscription;
        
        // Timeout für den Stream setzen
        final timer = Timer(Duration(seconds: 5), () {
          print("⏱️ Stream-Timeout: Stream hat nicht rechtzeitig geantwortet");
          if (!completer.isCompleted) {
            subscription.cancel();
            completer.complete([]);
          }
        });
        
        // Verwende die getFilteredOrders-Methode, wenn ein Status-Filter gesetzt ist
        if (_statusFilter != null) {
          print("⚙️ Verwende getFilteredOrders mit Status: $_statusFilter");
          subscription = _orderService.getFilteredOrders(status: _statusFilter).listen(
            (streamResult) {
              print("📦 Stream lieferte ${streamResult.length} Aufträge");
              if (!completer.isCompleted) {
                timer.cancel();
                completer.complete(streamResult);
                subscription.cancel();
              }
            },
            onError: (error) {
              print("❌ Stream-Fehler: $error");
              if (!completer.isCompleted) {
                timer.cancel();
                completer.complete([]);
                subscription.cancel();
              }
            }
          );
        } else {
          print("⚙️ Verwende getOrders ohne Filter");
          subscription = _orderService.getOrders().listen(
            (streamResult) {
              print("📦 Stream lieferte ${streamResult.length} Aufträge");
              if (!completer.isCompleted) {
                timer.cancel();
                completer.complete(streamResult);
                subscription.cancel();
              }
            },
            onError: (error) {
              print("❌ Stream-Fehler: $error");
              if (!completer.isCompleted) {
                timer.cancel();
                completer.complete([]);
                subscription.cancel();
              }
            }
          );
        }
        
        // Warte auf das Ergebnis vom Stream
        orders = await completer.future;
        
        if (orders.isNotEmpty) {
          print("✅ Stream-Methode erfolgreich: ${orders.length} Aufträge geladen");
          streamLoaded = true;
        } else {
          print("⚠️ Stream-Methode lieferte keine Aufträge");
        }
      } catch (e) {
        print("❌ Fehler beim Laden über Stream: $e");
      }
      
      // Zweiter Versuch: Wenn der Stream keine Aufträge lieferte, verwende die direkte Methode
      if (!streamLoaded) {
        try {
          print("⚙️ Versuch 2: Lade Aufträge über direkte Methode");
          final directOrders = await _orderService.getOrdersDirectly();
          
          if (directOrders.isNotEmpty) {
            orders = directOrders;
            print("✅ Direkte Methode erfolgreich: ${orders.length} Aufträge geladen");
            
            // Lokale Filterung nach Status, wenn ein Filter angegeben wurde
            if (_statusFilter != null) {
              final unfiltered = orders.length;
              print("🔍 Führe lokale Filterung für Status ${_statusFilter.toString()} durch");
              
              orders = orders.where((order) => order.status == _statusFilter).toList();
              print("🔍 Filterung abgeschlossen: ${orders.length} von $unfiltered Aufträgen haben den Status ${_statusFilter.toString()}");
            }
          } else {
            print("⚠️ Auch direkte Methode lieferte keine Aufträge");
          }
        } catch (directError) {
          print("❌ Fehler beim direkten Laden: $directError");
        }
      }
      
      // Prüfen, ob überhaupt Daten in Firestore existieren
      try {
        final collectionSnapshot = await fb_store.FirebaseFirestore.instance.collection('orders').get();
        print("📊 'orders' Collection enthält direkt abgefragt ${collectionSnapshot.docs.length} Dokumente");
        
        if (collectionSnapshot.docs.isEmpty && orders.isEmpty) {
          print("⚠️ PROBLEM ERKANNT: 'orders' Collection ist leer! Es gibt keine Aufträge in der Datenbank.");
        } else if (collectionSnapshot.docs.isNotEmpty && orders.isEmpty) {
          print("❗ KRITISCHES PROBLEM: 'orders' Collection enthält ${collectionSnapshot.docs.length} Dokumente, aber keine konnten geladen werden!");
          print("   Mögliche Ursachen: Fehler bei der Konvertierung oder Berechtigungsprobleme");
        }
      } catch (e) {
        print("❌ Fehler bei der direkten Collection-Prüfung: $e");
      }
      
      if (mounted) {
        setState(() {
          // Lokale Filterung für andere Filter (Kunde, Projekt, Suche)
          _filteredOrders = _filterOrders(orders);
          _isLoading = false;
        });
        
        // Feedback für den Benutzer, falls keine Aufträge geladen werden konnten
        if (_filteredOrders.isEmpty && orders.isNotEmpty) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Keine Aufträge mit den aktuellen Filtern gefunden')),
          );
        } else if (_filteredOrders.isEmpty) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Keine Aufträge gefunden. Wurden Aufträge in der Webanwendung erstellt?'),
              duration: Duration(seconds: 5),
            )
          );
        }
      }
    } catch (e, stackTrace) {
      print("❌ Unerwarteter Fehler beim Laden der Aufträge: $e");
      print("Stacktrace: $stackTrace");
      
      if (mounted) {
        setState(() {
          _isLoading = false;
          _filteredOrders = [];
        });
        
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Fehler beim Laden der Aufträge: $e'),
            duration: Duration(seconds: 10),
            action: SnackBarAction(
              label: 'Details',
              onPressed: () {
                showDialog(
                  context: context,
                  builder: (context) => AlertDialog(
                    title: Text('Fehlerdetails'),
                    content: SingleChildScrollView(
                      child: Text('$e\n\n$stackTrace'),
                    ),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.of(context).pop(),
                        child: Text('Schließen'),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
        );
      }
    }
  }
  
  // Methode zum Filtern der Aufträge
  List<app_models.Order> _filterOrders(List<app_models.Order> orders) {
    var filtered = orders;
    
    // Nach Status filtern
    if (_statusFilter != null) {
      filtered = filtered.where((order) => order.status == _statusFilter).toList();
    }
    
    // Nach Kunde filtern
    if (_customerFilter != null) {
      filtered = filtered.where((order) => 
        order.clientName.toLowerCase().contains(_customerFilter!.toLowerCase())
      ).toList();
    }
    
    // Nach Projekt filtern
    if (_projectFilter != null) {
      filtered = filtered.where((order) => 
        order.projectName != null && 
        order.projectName!.toLowerCase().contains(_projectFilter!.toLowerCase())
      ).toList();
    }
    
    // Nach Suchbegriff filtern
    if (_searchQuery != null && _searchQuery!.isNotEmpty) {
      filtered = filtered.where((order) => 
        order.title.toLowerCase().contains(_searchQuery!.toLowerCase()) ||
        order.description.toLowerCase().contains(_searchQuery!.toLowerCase()) ||
        order.clientName.toLowerCase().contains(_searchQuery!.toLowerCase())
      ).toList();
    }
    
    // Nach Ansichtsmodus filtern
    switch(_viewMode) {
      case "team":
        // Hier würden wir in einer vollständigen App nach Team filtern
        break;
      case "my":
        // Hier würden wir in einer vollständigen App nach Benutzer filtern
        break;
      case "all":
      default:
        // Keine zusätzliche Filterung
        break;
    }
    
    // Sortieren nach Erstellungsdatum (absteigend)
    filtered.sort((a, b) => b.createdAt?.compareTo(a.createdAt ?? DateTime.now()) ?? 0);
    
    return filtered;
  }
  
  @override
  Widget build(BuildContext context) {
    // AutomaticKeepAliveClientMixin erfordert diesen Aufruf
    super.build(context);
    
    return _isLoading
        ? const Center(child: CircularProgressIndicator())
        : _buildBody();
  }

  Widget _buildBody() {
    return RefreshIndicator(
      onRefresh: _loadOrders,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.all(16.0),
              child: _buildFilterSection(),
            ),
            
            if (_filteredOrders.isEmpty && !_isLoading) 
              _buildEmptyState()
            else
              _buildOrdersList(),
            
            // Padding am Ende für den FloatingActionButton
            const SizedBox(height: 100),
          ],
        ),
      ),
    );
  }
  
  // Methode zum Erstellen des Filterbereichs
  Widget _buildFilterSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Suchleiste
        TextField(
          decoration: InputDecoration(
            hintText: 'Aufträge suchen...',
            prefixIcon: const Icon(Icons.search),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            contentPadding: const EdgeInsets.symmetric(vertical: 0),
          ),
          onChanged: (value) {
            setState(() {
              _searchQuery = value.isEmpty ? null : value;
              _loadOrders(); // Aufträge neu laden mit neuem Filter
            });
          },
        ),
        
        const SizedBox(height: 12),
        
        // Modus-Tabs (nur für Manager)
        if (isManager)
          Container(
            margin: EdgeInsets.only(bottom: 12),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.primary.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: TabBar(
              controller: _tabController,
              labelColor: Theme.of(context).colorScheme.primary,
              unselectedLabelColor: Colors.grey,
              indicatorColor: Theme.of(context).colorScheme.primary,
              tabs: const [
                Tab(text: 'Alle Aufträge'),
                Tab(text: 'Team-Aufträge'),
                Tab(text: 'Meine Aufträge'),
              ],
            ),
          ),
        
        // Status-Filter
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              _buildFilterChip(
                label: 'Alle',
                isSelected: _statusFilter == null,
                onSelected: (selected) {
                  if (selected) {
                    setState(() {
                      _statusFilter = null;
                      _loadOrders(); // Aufträge neu laden mit neuem Filter
                    });
                  }
                },
              ),
              _buildFilterChip(
                label: 'Ausstehend',
                isSelected: _statusFilter == OrderStatus.pending,
                onSelected: (selected) {
                  setState(() {
                    _statusFilter = selected ? OrderStatus.pending : null;
                    _loadOrders(); // Aufträge neu laden mit neuem Filter
                  });
                },
              ),
              _buildFilterChip(
                label: 'Genehmigt',
                isSelected: _statusFilter == OrderStatus.approved,
                onSelected: (selected) {
                  setState(() {
                    _statusFilter = selected ? OrderStatus.approved : null;
                    _loadOrders(); // Aufträge neu laden mit neuem Filter
                  });
                },
              ),
              _buildFilterChip(
                label: 'In Bearbeitung',
                isSelected: _statusFilter == OrderStatus.inProgress,
                onSelected: (selected) {
                  setState(() {
                    _statusFilter = selected ? OrderStatus.inProgress : null;
                    _loadOrders(); // Aufträge neu laden mit neuem Filter
                  });
                },
              ),
              _buildFilterChip(
                label: 'Abgeschlossen',
                isSelected: _statusFilter == OrderStatus.completed,
                onSelected: (selected) {
                  setState(() {
                    _statusFilter = selected ? OrderStatus.completed : null;
                    _loadOrders(); // Aufträge neu laden mit neuem Filter
                  });
                },
              ),
            ],
          ),
        ),
        
        // Kunden- und Projektfilter anzeigen, falls vorhanden
        if (_customerFilter != null || _projectFilter != null)
          Padding(
            padding: const EdgeInsets.only(top: 8.0),
            child: Row(
              children: [
                if (_customerFilter != null)
                  Padding(
                    padding: const EdgeInsets.only(right: 8.0),
                    child: Chip(
                      label: Text('Kunde: $_customerFilter'),
                      onDeleted: () {
                        setState(() {
                          _customerFilter = null;
                          _loadOrders(); // Aufträge neu laden mit neuem Filter
                        });
                      },
                      backgroundColor: Theme.of(context).colorScheme.primaryContainer,
                    ),
                  ),
                if (_projectFilter != null)
                  Chip(
                    label: Text('Projekt: $_projectFilter'),
                    onDeleted: () {
                      setState(() {
                        _projectFilter = null;
                        _loadOrders(); // Aufträge neu laden mit neuem Filter
                      });
                    },
                    backgroundColor: Theme.of(context).colorScheme.secondaryContainer,
                  ),
              ],
            ),
          ),
      ],
    );
  }
  
  // Methode zum Erstellen des leeren Zustands
  Widget _buildEmptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 32.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.assignment_outlined,
              size: 80,
              color: Colors.grey.shade400,
            ),
            const SizedBox(height: 16),
            Text(
              'Keine Aufträge gefunden',
              style: GoogleFonts.poppins(
                fontSize: 18,
                fontWeight: FontWeight.w500,
                color: Colors.grey.shade600,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              _statusFilter != null 
                ? 'Keine Aufträge mit dem Status ${_getStatusText(_statusFilter!)}'
                : 'Aufträge werden in der Webanwendung erstellt',
              style: GoogleFonts.poppins(
                fontSize: 14,
                color: Colors.grey.shade500,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: _loadOrders,
              icon: const Icon(Icons.refresh),
              label: const Text('Aktualisieren'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Theme.of(context).colorScheme.primary,
                foregroundColor: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }
  
  // Methode zum Erstellen der Auftragsliste
  Widget _buildOrdersList() {
    return ListView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(horizontal: 16),
      itemCount: _filteredOrders.length,
      itemBuilder: (context, index) {
        final order = _filteredOrders[index];
        return _buildOrderCard(context, order, Theme.of(context));
      },
    );
  }
  
  Widget _buildOrderCard(BuildContext context, app_models.Order order, ThemeData theme) {
    // Prüfen, ob der aktuelle Benutzer den Auftrag genehmigen kann
    final bool canApprove = isManager && order.status == OrderStatus.pending;
    
    // Debug-Ausgabe der Kunden- und Projektdaten
    print('Auftrag ${order.id}: Kunde=${order.clientName}, KundeID=${order.clientId}, Projekt=${order.projectName}, ProjektID=${order.projectId}');
    
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
      ),
      elevation: 2,
      child: InkWell(
        onTap: () {
          _showOrderDetailsDialog(context, order.id!);
        },
        borderRadius: BorderRadius.circular(12),
        child: Column(
          children: [
            // Titelleiste mit Status
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: theme.colorScheme.primary.withOpacity(0.1),
                borderRadius: BorderRadius.only(
                  topLeft: Radius.circular(12),
                  topRight: Radius.circular(12),
                ),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Text(
                      order.title,
                      style: GoogleFonts.poppins(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Row(
                    children: [
                      if (order.isUrgent)
                        Padding(
                          padding: const EdgeInsets.only(right: 8.0),
                          child: Icon(
                            Icons.priority_high,
                            color: Colors.red,
                            size: 18,
                          ),
                        ),
                      _buildStatusBadge(order.status),
                    ],
                  ),
                ],
              ),
            ),
            
            // Hauptinhalt
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Kundenzeile - immer anzeigen, auch wenn leer
                  Container(
                    padding: EdgeInsets.symmetric(vertical: 6, horizontal: 10),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.primaryContainer.withOpacity(0.3),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(Icons.business, size: 16, color: theme.colorScheme.primary),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                'Kunde: ${order.clientName.isNotEmpty ? order.clientName : "Nicht angegeben"}',
                                style: GoogleFonts.poppins(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w500,
                                  color: theme.colorScheme.primary,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                        // Kontaktperson anzeigen, falls vorhanden
                        if (order.clientContactPerson != null && order.clientContactPerson!.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 4.0, left: 22.0),
                            child: Text(
                              'Ansprechpartner: ${order.clientContactPerson}',
                              style: GoogleFonts.poppins(
                                fontSize: 12,
                                color: theme.colorScheme.primary.withOpacity(0.8),
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                      ],
                    ),
                  ),
                  
                  const SizedBox(height: 8),
                  
                  // Projektzeile - immer anzeigen, auch wenn leer oder null
                  Container(
                    padding: EdgeInsets.symmetric(vertical: 6, horizontal: 10),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.secondaryContainer.withOpacity(0.3),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(Icons.folder, size: 16, color: theme.colorScheme.secondary),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                'Projekt: ${order.projectName != null && order.projectName!.isNotEmpty ? order.projectName! : "Kein Projekt zugewiesen"}',
                                style: GoogleFonts.poppins(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w500,
                                  color: theme.colorScheme.secondary,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                        // Standort anzeigen, falls vorhanden
                        if (order.projectLocation != null && order.projectLocation!.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 4.0, left: 22.0),
                            child: Text(
                              'Standort: ${order.projectLocation}',
                              style: GoogleFonts.poppins(
                                fontSize: 12,
                                color: theme.colorScheme.secondary.withOpacity(0.8),
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                      ],
                    ),
                  ),
                  
                  const SizedBox(height: 12),
                  
                  // Verantwortlicher Teamleiter, falls vorhanden
                  if (order.teamLeadName != null && order.teamLeadName!.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8.0),
                      child: Row(
                        children: [
                          Icon(Icons.person, size: 16, color: Colors.indigo),
                          const SizedBox(width: 6),
                          Text(
                            'Teamleiter: ${order.teamLeadName}',
                            style: GoogleFonts.poppins(
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                              color: Colors.indigo,
                            ),
                          ),
                        ],
                      ),
                    ),
                  
                  // Auftragsdetails in zwei Spalten
                  Row(
                    children: [
                      // Linke Spalte: Zeitraum
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Zeitraum:',
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.grey.shade600,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Row(
                              children: [
                                Icon(Icons.date_range, size: 16, color: Colors.blue.shade700),
                                const SizedBox(width: 4),
                                Expanded(
                                  child: Text(
                                    order.startDate != null && order.dueDate != null
                                        ? '${_formatDateWithTime(order.startDate!)} - ${_formatDateWithTime(order.dueDate!)}'
                                        : order.startDate != null 
                                            ? 'Ab ${_formatDateWithTime(order.startDate!)}'
                                            : 'Nicht festgelegt',
                                    style: GoogleFonts.poppins(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w500,
                                      color: Colors.blue.shade700,
                                    ),
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      
                      // Rechte Spalte: Aufwand
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Aufwand:',
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.grey.shade600,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Row(
                              children: [
                                Icon(Icons.access_time, size: 16, color: Colors.indigo.shade700),
                                const SizedBox(width: 4),
                                Text(
                                  '${order.actualHours}/${order.estimatedHours}h',
                                  style: GoogleFonts.poppins(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w500,
                                    color: order.actualHours > order.estimatedHours 
                                      ? Colors.red.shade700 
                                      : Colors.indigo.shade700,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  
                  const SizedBox(height: 8),
                  
                  // Fälligkeitsdatum, falls vorhanden
                  if (order.dueDate != null)
                    Container(
                      padding: EdgeInsets.symmetric(vertical: 6, horizontal: 10),
                      decoration: BoxDecoration(
                        color: order.dueDate!.isBefore(DateTime.now())
                          ? Colors.red.shade50
                          : (DateTime.now().difference(order.dueDate!).inDays).abs() <= 3
                            ? Colors.amber.shade50
                            : Colors.green.shade50,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            Icons.event, 
                            size: 16, 
                            color: order.dueDate!.isBefore(DateTime.now())
                              ? Colors.red.shade700
                              : (DateTime.now().difference(order.dueDate!).inDays).abs() <= 3
                                ? Colors.amber.shade700
                                : Colors.green.shade700,
                          ),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              'Fällig: ${_formatDateWithTime(order.dueDate!)}',
                              style: GoogleFonts.poppins(
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                                color: order.dueDate!.isBefore(DateTime.now())
                                  ? Colors.red.shade700
                                  : (DateTime.now().difference(order.dueDate!).inDays).abs() <= 3
                                    ? Colors.amber.shade700
                                    : Colors.green.shade700,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  
                  // Erstellungsdatum und verantwortliche Person
                  if (order.createdAt != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 8.0),
                      child: Row(
                        children: [
                          Icon(Icons.person_outline, size: 14, color: Colors.grey),
                          const SizedBox(width: 4),
                          Text(
                            'Erstellt: ${_formatDate(order.createdAt!)} von ${order.createdByName}',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey.shade600,
                            ),
                          ),
                        ],
                      ),
                    ),
                    
                  // Bestätigungsfrist anzeigen, falls vorhanden
                  if (order.confirmationDeadline != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 8.0),
                      child: Row(
                        children: [
                          Icon(
                            Icons.timer_outlined, 
                            size: 14, 
                            color: order.confirmationDeadline!.isBefore(DateTime.now())
                              ? Colors.red.shade600
                              : Colors.amber.shade700,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            'Bestätigung bis: ${_formatDateWithTime(order.confirmationDeadline!)}',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                              color: order.confirmationDeadline!.isBefore(DateTime.now())
                                ? Colors.red.shade600
                                : Colors.amber.shade700,
                            ),
                          ),
                        ],
                      ),
                    ),
                    
                  // Tags anzeigen
                  if (order.tags.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 8.0),
                      child: Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: order.tags.map((tag) => 
                          Container(
                            padding: EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: theme.colorScheme.surfaceVariant,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Text(
                              tag,
                              style: TextStyle(
                                fontSize: 11,
                                color: theme.colorScheme.onSurfaceVariant,
                              ),
                            ),
                          )
                        ).toList(),
                      ),
                    ),
                ],
              ),
            ),
            
            // Genehmigungsbuttons für Manager
            if (canApprove)
              Container(
                decoration: BoxDecoration(
                  color: theme.colorScheme.surface,
                  border: Border(
                    top: BorderSide(color: Colors.grey.shade300, width: 1),
                  ),
                  borderRadius: BorderRadius.only(
                    bottomLeft: Radius.circular(12),
                    bottomRight: Radius.circular(12),
                  ),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Row(
                  children: [
                    Icon(
                      Icons.notifications_active, 
                      size: 18,
                      color: Colors.orange,
                    ),
                    SizedBox(width: 8),
                    Text(
                      'Genehmigung erforderlich',
                      style: TextStyle(
                        color: Colors.orange,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    Spacer(),
                    ElevatedButton.icon(
                      onPressed: () => _showApprovalDialog(context, order, true),
                      icon: Icon(Icons.check_circle, size: 16),
                      label: Text('Genehmigen'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.green,
                        foregroundColor: Colors.white,
                        padding: EdgeInsets.symmetric(horizontal: 12, vertical: 0),
                        minimumSize: Size(0, 36),
                      ),
                    ),
                    SizedBox(width: 8),
                    ElevatedButton.icon(
                      onPressed: () => _showApprovalDialog(context, order, false),
                      icon: Icon(Icons.cancel, size: 16),
                      label: Text('Ablehnen'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.red,
                        foregroundColor: Colors.white,
                        padding: EdgeInsets.symmetric(horizontal: 12, vertical: 0),
                        minimumSize: Size(0, 36),
                      ),
                    ),
                  ],
                ),
              ),
              
            // Anzeige, dass der Auftrag auf Genehmigung wartet (für Nicht-Manager)
            if (order.status == OrderStatus.pending && !canApprove)
              Container(
                decoration: BoxDecoration(
                  color: Colors.orange.withOpacity(0.1),
                  border: Border(
                    top: BorderSide(color: Colors.grey.shade300, width: 1),
                  ),
                  borderRadius: BorderRadius.only(
                    bottomLeft: Radius.circular(12),
                    bottomRight: Radius.circular(12),
                  ),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Row(
                  children: [
                    Icon(
                      Icons.hourglass_top, 
                      size: 18,
                      color: Colors.orange,
                    ),
                    SizedBox(width: 8),
                    Text(
                      'Warten auf Genehmigung',
                      style: TextStyle(
                        color: Colors.orange,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
              
            // Anzeige für abgelehnte Aufträge
            if (order.status == OrderStatus.rejected)
              Container(
                decoration: BoxDecoration(
                  color: Colors.red.withOpacity(0.1),
                  border: Border(
                    top: BorderSide(color: Colors.grey.shade300, width: 1),
                  ),
                  borderRadius: BorderRadius.only(
                    bottomLeft: Radius.circular(12),
                    bottomRight: Radius.circular(12),
                  ),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(
                          Icons.cancel_outlined, 
                          size: 18,
                          color: Colors.red,
                        ),
                        SizedBox(width: 8),
                        Text(
                          'Auftrag abgelehnt',
                          style: TextStyle(
                            color: Colors.red,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                    if (order.rejectionReason != null && order.rejectionReason!.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 4.0, left: 26.0),
                        child: Text(
                          'Grund: ${order.rejectionReason}',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.red.shade700,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                  ],
                ),
              ),
              
            // Anzeige für genehmigte Aufträge
            if (order.status == OrderStatus.approved)
              Container(
                decoration: BoxDecoration(
                  color: Colors.green.withOpacity(0.1),
                  border: Border(
                    top: BorderSide(color: Colors.grey.shade300, width: 1),
                  ),
                  borderRadius: BorderRadius.only(
                    bottomLeft: Radius.circular(12),
                    bottomRight: Radius.circular(12),
                  ),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Row(
                  children: [
                    Icon(
                      Icons.check_circle_outline, 
                      size: 18,
                      color: Colors.green,
                    ),
                    SizedBox(width: 8),
                    Text(
                      'Genehmigt - Bereit zum Start',
                      style: TextStyle(
                        color: Colors.green,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    Spacer(),
                    if (isManager)
                      ElevatedButton.icon(
                        onPressed: () async {
                          final btnContext = context;
                          final scaffoldMsg = ScaffoldMessenger.of(context);
                          
                          try {
                            // Dialog schließen
                            Navigator.of(btnContext).pop();
                            
                            // Ladeanimation anzeigen mit WillPopScope
                            showDialog(
                              context: btnContext,
                              barrierDismissible: false,
                              builder: (_) => const WillPopScope(
                                onWillPop: null,
                                child: Center(child: CircularProgressIndicator())
                              ),
                            );
                            
                            // Auftrag annehmen
                            await _orderService.acceptOrder(order.id!);
                            
                            // Nur fortfahren wenn Widget noch aktiv
                            if (!mounted) return;
                            
                            // Dialog schließen
                            Navigator.of(btnContext).pop();
                            
                            // UI aktualisieren und Meldung
                            scaffoldMsg.showSnackBar(
                              const SnackBar(content: Text('Auftrag erfolgreich angenommen')),
                            );
                            setState(() {});
                          } catch (e) {
                            if (mounted) {
                              try {
                                Navigator.of(btnContext).pop();
                              } catch (_) {}
                              
                              scaffoldMsg.showSnackBar(
                                SnackBar(content: Text('Fehler: $e')),
                              );
                            }
                          }
                        },
                        icon: Icon(Icons.check_circle, color: Colors.white, size: 18),
                        label: Text('Annehmen'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.green,
                          foregroundColor: Colors.white,
                          minimumSize: Size(0, 40),
                        ),
                      ),
                  ],
                ),
              ),
              
            // Anzeige für in Bearbeitung befindliche Aufträge
            if (order.status == OrderStatus.inProgress)
              Container(
                decoration: BoxDecoration(
                  color: Colors.blue.withOpacity(0.1),
                  border: Border(
                    top: BorderSide(color: Colors.grey.shade300, width: 1),
                  ),
                  borderRadius: BorderRadius.only(
                    bottomLeft: Radius.circular(12),
                    bottomRight: Radius.circular(12),
                  ),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Row(
                  children: [
                    Icon(
                      Icons.engineering, 
                      size: 18,
                      color: Colors.blue,
                    ),
                    SizedBox(width: 8),
                    Text(
                      'In Bearbeitung',
                      style: TextStyle(
                        color: Colors.blue,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    Spacer(),
                    if (isManager || order.teamLeadId == _currentUserId)
                      Row(
                        children: [
                          ElevatedButton.icon(
                            onPressed: () => _showAddTimeEntryDialog(context, order),
                            icon: Icon(Icons.timer, size: 16),
                            label: Text('Zeit'),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.blue.shade700,
                              foregroundColor: Colors.white,
                              padding: EdgeInsets.symmetric(horizontal: 12, vertical: 0),
                              minimumSize: Size(0, 36),
                            ),
                          ),
                          SizedBox(width: 8),
                          ElevatedButton.icon(
                            onPressed: () => _showCompleteOrderDialog(context, order),
                            icon: Icon(Icons.check, size: 16),
                            label: Text('Abschließen'),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.teal,
                              foregroundColor: Colors.white,
                              padding: EdgeInsets.symmetric(horizontal: 12, vertical: 0),
                              minimumSize: Size(0, 36),
                            ),
                          ),
                        ],
                      ),
                  ],
                ),
              ),
              
            // Anzeige für abgeschlossene Aufträge
            if (order.status == OrderStatus.completed)
              Container(
                decoration: BoxDecoration(
                  color: Colors.teal.withOpacity(0.1),
                  border: Border(
                    top: BorderSide(color: Colors.grey.shade300, width: 1),
                  ),
                  borderRadius: BorderRadius.only(
                    bottomLeft: Radius.circular(12),
                    bottomRight: Radius.circular(12),
                  ),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Row(
                  children: [
                    Icon(
                      Icons.task_alt, 
                      size: 18,
                      color: Colors.teal,
                    ),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Abgeschlossen am ${order.completedAt != null ? _formatDate(order.completedAt!) : 'Unbekanntes Datum'}',
                        style: TextStyle(
                          color: Colors.teal,
                          fontWeight: FontWeight.bold,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
  
  // Dialog zur Genehmigung oder Ablehnung eines Auftrags (nur für Manager)
  void _showApprovalDialog(BuildContext context, app_models.Order order, bool approve) {
    if (!mounted) return;
    
    final commentsController = TextEditingController();
    final currentContext = context;
    
    showDialog(
      context: currentContext,
      builder: (dialogContext) => AlertDialog(
        title: Text(approve ? 'Auftrag genehmigen' : 'Auftrag ablehnen'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            RichText(
              text: TextSpan(
                style: TextStyle(color: Theme.of(dialogContext).textTheme.bodyLarge?.color),
                children: [
                  TextSpan(
                    text: 'Auftrag: ',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  TextSpan(text: order.title),
                ],
              ),
            ),
            SizedBox(height: 8),
            RichText(
              text: TextSpan(
                style: TextStyle(color: Theme.of(dialogContext).textTheme.bodyLarge?.color),
                children: [
                  TextSpan(
                    text: 'Kunde: ',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  TextSpan(text: order.clientName),
                ],
              ),
            ),
            if (order.projectName != null && order.projectName!.isNotEmpty) ...[
              SizedBox(height: 8),
              RichText(
                text: TextSpan(
                  style: TextStyle(color: Theme.of(dialogContext).textTheme.bodyLarge?.color),
                  children: [
                    TextSpan(
                      text: 'Projekt: ',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                    TextSpan(text: order.projectName!),
                  ],
                ),
              ),
            ],
            SizedBox(height: 16),
            Text(
              approve ? 
              'Möchten Sie den Auftrag als Manager genehmigen?' : 
              'Möchten Sie den Auftrag als Manager ablehnen?',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            SizedBox(height: 16),
            TextField(
              controller: commentsController,
              decoration: InputDecoration(
                labelText: 'Kommentar',
                border: OutlineInputBorder(),
              ),
              maxLines: 3,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: Text('Abbrechen'),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.of(dialogContext).pop(); // Dialog schließen
              
              if (!mounted) return;
              
              // Lade-Dialog anzeigen
              showDialog(
                context: currentContext,
                barrierDismissible: false,
                builder: (context) => Center(child: CircularProgressIndicator()),
              );
              
              try {
                if (approve) {
                  await _orderService.approveOrder(order.id!, commentsController.text);
                } else {
                  await _orderService.rejectOrder(order.id!, commentsController.text);
                }
                
                // Überprüfe, ob Widget noch eingebunden ist
                if (!mounted) return;
                
                // Lade-Dialog schließen
                try {
                  Navigator.of(currentContext).pop();
                } catch (_) {}
                
                ScaffoldMessenger.of(currentContext).showSnackBar(
                  SnackBar(content: Text(approve ? 'Auftrag wurde genehmigt' : 'Auftrag wurde abgelehnt')),
                );
                
                // State aktualisieren
                setState(() {});
              } catch (e) {
                // Überprüfe, ob Widget noch eingebunden ist
                if (!mounted) return;
                
                // Lade-Dialog schließen
                try {
                  Navigator.of(currentContext).pop();
                } catch (_) {}
                
                ScaffoldMessenger.of(currentContext).showSnackBar(
                  SnackBar(content: Text('Fehler: $e')),
                );
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: approve ? Colors.green : Colors.red,
              foregroundColor: Colors.white,
            ),
            child: Text(approve ? 'Genehmigen' : 'Ablehnen'),
          ),
        ],
      ),
    );
  }
  
  // Angepasster Detaildialog mit zusätzlichen Informationen und Funktionen
  void _showOrderDetailsDialog(BuildContext context, String orderId) async {
    if (!mounted) return;
    
    // Speichere Referenzen für spätere Nutzung
    final btnContext = context;
    final scaffoldMsg = ScaffoldMessenger.of(context);
    
    // Zeige Ladeanimation an
    showDialog(
      context: btnContext,
      barrierDismissible: false,
      builder: (_) => const WillPopScope(
        onWillPop: null,
        child: Center(child: CircularProgressIndicator()),
      ),
    );
    
    try {
      // Lade Auftragsdaten
      final order = await _orderService.getOrder(orderId);
      
      // Überprüfe ob Widget noch existiert
      if (!mounted) return;
      
      // Sicheres Schließen der Ladeanimation
      if (mounted) {
        try {
          Navigator.of(btnContext).pop();
        } catch (error) {
          print('Fehler beim Schließen der Ladeanimation: $error');
        }
      } else {
        return; // Abbrechen wenn Widget nicht mehr eingebunden
      }
      
      if (order == null) {
        if (mounted) {
          scaffoldMsg.showSnackBar(
            const SnackBar(content: Text('Auftrag nicht gefunden')),
          );
        }
        return;
      }
      
      // Überprüfe erneut ob Widget noch existiert
      if (!mounted) return;
      
      // Zeige Auftragsdetails
      if (mounted) {
        try {
          showDialog(
            context: btnContext,
            builder: (dialogContext) => Dialog(
              backgroundColor: Colors.transparent,
              insetPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 24),
              child: DefaultTabController(
                length: 3, // Zurück auf 3 Tabs (entferne Maps-Tab)
                child: Container(
                  decoration: BoxDecoration(
                    color: Theme.of(dialogContext).scaffoldBackgroundColor,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Header mit Titel und Status
                      _buildDialogHeader(dialogContext, order),
                      
                      // Tabs
                      Container(
                        decoration: BoxDecoration(
                          color: Theme.of(dialogContext).cardColor,
                          border: Border(
                            bottom: BorderSide(color: Colors.grey.withOpacity(0.2)),
                          ),
                        ),
                        child: TabBar(
                          labelColor: Theme.of(dialogContext).colorScheme.primary,
                          unselectedLabelColor: Colors.grey,
                          indicatorColor: Theme.of(dialogContext).colorScheme.primary,
                          isScrollable: false, // Keine Scrollbar nötig für nur 3 Tabs
                          tabs: [
                            Tab(text: 'Übersicht'),
                            Tab(text: 'Details'),
                            Tab(text: 'Zeiterfassung'),
                          ],
                        ),
                      ),
                      
                      // Tab Content
                      Flexible(
                        child: Container(
                          height: MediaQuery.of(dialogContext).size.height * 0.5,
                          child: TabBarView(
                            children: [
                              _buildOverviewTab(dialogContext, order),
                              _buildDetailsTab(dialogContext, order),
                              _buildTimeEntriesTab(dialogContext, order),
                            ],
                          ),
                        ),
                      ),
                      
                      // Aktionsbereich am unteren Rand
                      _buildActionArea(dialogContext, order),
                    ],
                  ),
                ),
              ),
            ),
          );
        } catch (dialogError) {
          if (mounted) {
            try {
              Navigator.of(context).pop();
            } catch (_) {}
            
            print("Fehler beim Laden der Auftragsdetails: $dialogError");
            
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('Fehler beim Laden der Auftragsdetails'),
                duration: Duration(seconds: 10),
                action: SnackBarAction(
                  label: 'OK',
                  onPressed: () {},
                ),
              ),
            );
          }
        }
      }
    } catch (loadError) {
      if (!mounted) return;
      
      try {
        Navigator.of(context).pop();
      } catch (_) {}
      
      print("Fehler beim Laden der Auftragsdetails: $loadError");
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Fehler beim Laden der Auftragsdetails'),
          duration: Duration(seconds: 10),
          action: SnackBarAction(
            label: 'OK',
            onPressed: () {},
          ),
        ),
      );
    }
  }
  
  // Dialog Header
  Widget _buildDialogHeader(BuildContext context, app_models.Order order) {
    return Container(
      padding: EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.primary,
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(16),
          topRight: Radius.circular(16),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  order.title,
                  style: GoogleFonts.poppins(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                  overflow: TextOverflow.ellipsis,
                  maxLines: 2,
                ),
              ),
              SizedBox(width: 8),
              Container(
                padding: EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  _getStatusText(order.status),
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    fontSize: 12,
                  ),
                ),
              ),
              SizedBox(width: 4),
              IconButton(
                icon: Icon(Icons.close, color: Colors.white),
                onPressed: () => Navigator.of(context).pop(),
                visualDensity: VisualDensity.compact,
                padding: EdgeInsets.zero,
                constraints: BoxConstraints(),
              ),
            ],
          ),
        ],
      ),
    );
  }
  
  // Übersichts-Tab
  Widget _buildOverviewTab(BuildContext context, app_models.Order order) {
    ThemeData theme = Theme.of(context);
    
    return SingleChildScrollView(
      padding: EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Kunde & Projekt Karte
          Card(
            margin: EdgeInsets.only(bottom: 16),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            elevation: 1,
            child: Padding(
              padding: EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Kunde & Projekt',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: theme.colorScheme.primary,
                    ),
                  ),
                  Divider(),
                  Row(
                    children: [
                      Icon(Icons.business, 
                           color: theme.colorScheme.primary.withOpacity(0.7), 
                           size: 20),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          order.clientName.isNotEmpty ? order.clientName : 'Kein Kunde',
                          style: TextStyle(fontSize: 15),
                        ),
                      ),
                    ],
                  ),
                  SizedBox(height: 8),
                  Row(
                    children: [
                      Icon(Icons.folder, 
                           color: theme.colorScheme.secondary.withOpacity(0.7), 
                           size: 20),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          order.projectName != null && order.projectName!.isNotEmpty 
                            ? order.projectName! 
                            : 'Kein Projekt',
                          style: TextStyle(fontSize: 15),
                        ),
                      ),
                    ],
                  ),
                  
                  // Adresse hinzugefügt (mit Klickfunktion für Navigation)
                  if (order.projectLocation != null && order.projectLocation!.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 8.0),
                      child: InkWell(
                        onTap: () => _openInMaps(order.projectLocation!),
                        child: Row(
                          children: [
                            Icon(Icons.location_on, 
                                color: Colors.red.withOpacity(0.7), 
                                size: 20),
                            SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                order.projectLocation!,
                                style: TextStyle(
                                  fontSize: 15,
                                  color: Colors.blue,
                                  decoration: TextDecoration.underline,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
          
          // Status & Termine
          Card(
            margin: EdgeInsets.only(bottom: 16),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            elevation: 1,
            child: Padding(
              padding: EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Status & Termine',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: theme.colorScheme.primary,
                    ),
                  ),
                  Divider(),
                  
                  // Zeitraum
                  if (order.startDate != null || order.dueDate != null)
                    Padding(
                      padding: EdgeInsets.only(bottom: 8),
                      child: Row(
                        children: [
                          Icon(Icons.calendar_today, color: Colors.indigo, size: 20),
                          SizedBox(width: 8),
                          Expanded(
                            child: RichText(
                              text: TextSpan(
                                style: TextStyle(color: theme.textTheme.bodyLarge?.color),
                                children: [
                                  TextSpan(text: 'Zeitraum: '),
                                  TextSpan(
                                    text: order.startDate != null && order.dueDate != null
                                      ? '${_formatDate(order.startDate!)} - ${_formatDate(order.dueDate!)}'
                                      : order.startDate != null
                                        ? 'Ab ${_formatDate(order.startDate!)}'
                                        : order.dueDate != null
                                          ? 'Bis ${_formatDate(order.dueDate!)}'
                                          : 'Nicht definiert',
                                    style: TextStyle(fontWeight: FontWeight.w500),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    
                  // Fälligkeitsdatum
                  if (order.dueDate != null)
                    Padding(
                      padding: EdgeInsets.only(bottom: 8),
                      child: Row(
                        children: [
                          Icon(
                            Icons.event, 
                            color: order.dueDate!.isBefore(DateTime.now())
                              ? Colors.red
                              : Colors.green,
                            size: 20,
                          ),
                          SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Fällig: ${_formatDateWithTime(order.dueDate!)}',
                              style: TextStyle(
                                color: order.dueDate!.isBefore(DateTime.now())
                                  ? Colors.red
                                  : Colors.green,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    
                  // Bestätigungsfrist
                  if (order.confirmationDeadline != null)
                    Padding(
                      padding: EdgeInsets.only(bottom: 8),
                      child: Row(
                        children: [
                          Icon(
                            Icons.timer,
                            color: order.confirmationDeadline!.isBefore(DateTime.now())
                              ? Colors.red
                              : Colors.orange,
                            size: 20,
                          ),
                          SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Bestätigung bis: ${_formatDateWithTime(order.confirmationDeadline!)}',
                              style: TextStyle(
                                color: order.confirmationDeadline!.isBefore(DateTime.now())
                                  ? Colors.red
                                  : Colors.orange,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  
                  // Aufwand
                  Padding(
                    padding: EdgeInsets.only(bottom: 8),
                    child: Row(
                      children: [
                        Icon(Icons.timer, color: Colors.blue, size: 20),
                        SizedBox(width: 8),
                        Expanded(
                          child: RichText(
                            text: TextSpan(
                              style: TextStyle(color: theme.textTheme.bodyLarge?.color),
                              children: [
                                TextSpan(text: 'Aufwand: '),
                                TextSpan(
                                  text: '${order.actualHours} / ${order.estimatedHours} Stunden',
                                  style: TextStyle(
                                    fontWeight: FontWeight.w500,
                                    color: order.actualHours > order.estimatedHours 
                                      ? Colors.red 
                                      : Colors.blue,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          
          // Verantwortlichkeiten
          Card(
            margin: EdgeInsets.only(bottom: 16),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            elevation: 1,
            child: Padding(
              padding: EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Verantwortlichkeiten',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: theme.colorScheme.primary,
                    ),
                  ),
                  Divider(),
                  
                  // Erstellt von
                  Padding(
                    padding: EdgeInsets.only(bottom: 8),
                    child: Row(
                      children: [
                        Icon(Icons.person_outline, color: Colors.grey, size: 20),
                        SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Erstellt von: ${order.createdByName}',
                          ),
                        ),
                      ],
                    ),
                  ),
                  
                  // Teamleiter
                  if (order.teamLeadName != null && order.teamLeadName!.isNotEmpty)
                    Padding(
                      padding: EdgeInsets.only(bottom: 8),
                      child: Row(
                        children: [
                          Icon(Icons.star, color: Colors.amber, size: 20),
                          SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Teamleiter: ${order.teamLeadName}',
                              style: TextStyle(fontWeight: FontWeight.w500),
                            ),
                          ),
                        ],
                      ),
                    ),
                  
                  // Hauptverantwortlicher
                  if (order.assignedToName != null && order.assignedToName!.isNotEmpty)
                    Padding(
                      padding: EdgeInsets.only(bottom: 8),
                      child: Row(
                        children: [
                          Icon(Icons.person, color: Colors.indigo, size: 20),
                          SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Verantwortlich: ${order.assignedToName}',
                              style: TextStyle(fontWeight: FontWeight.w500),
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
  
  // Details-Tab
  Widget _buildDetailsTab(BuildContext context, app_models.Order order) {
    ThemeData theme = Theme.of(context);
    
    return SingleChildScrollView(
      padding: EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Beschreibung
          Card(
            margin: EdgeInsets.only(bottom: 16),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            elevation: 1,
            child: Padding(
              padding: EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Beschreibung',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: theme.colorScheme.primary,
                    ),
                  ),
                  Divider(),
                  Text(
                    order.description.isNotEmpty 
                      ? order.description 
                      : 'Keine Beschreibung verfügbar',
                    style: TextStyle(fontSize: 14),
                  ),
                ],
              ),
            ),
          ),
          
          // Kontaktpersonen
          if (order.clientContactPerson != null && order.clientContactPerson!.isNotEmpty)
            Card(
              margin: EdgeInsets.only(bottom: 16),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              elevation: 1,
              child: Padding(
                padding: EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Kontaktperson',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: theme.colorScheme.primary,
                      ),
                    ),
                    Divider(),
                    Row(
                      children: [
                        Icon(Icons.person, color: Colors.blue, size: 20),
                        SizedBox(width: 8),
                        Expanded(
                          child: Text(order.clientContactPerson!),
                        ),
                      ],
                    ),
                    if (order.clientContactEmail != null && order.clientContactEmail!.isNotEmpty)
                      Padding(
                        padding: EdgeInsets.only(top: 8, left: 28),
                        child: Row(
                          children: [
                            Icon(Icons.email, color: Colors.blue, size: 16),
                            SizedBox(width: 8),
                            Expanded(
                              child: Text(order.clientContactEmail!),
                            ),
                          ],
                        ),
                      ),
                    if (order.clientContactPhone != null && order.clientContactPhone!.isNotEmpty)
                      Padding(
                        padding: EdgeInsets.only(top: 8, left: 28),
                        child: Row(
                          children: [
                            Icon(Icons.phone, color: Colors.blue, size: 16),
                            SizedBox(width: 8),
                            Expanded(
                              child: Text(order.clientContactPhone!),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ),
          
          // Aufgaben
          if (order.tasks.isNotEmpty)
            Card(
              margin: EdgeInsets.only(bottom: 16),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              elevation: 1,
              child: Padding(
                padding: EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Aufgaben',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: theme.colorScheme.primary,
                      ),
                    ),
                    Divider(),
                    ...order.tasks.map((task) => 
                      Padding(
                        padding: EdgeInsets.only(bottom: 8),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(
                              task.completed ? Icons.check_circle : Icons.radio_button_unchecked,
                              color: task.completed ? Colors.green : Colors.grey,
                              size: 20,
                            ),
                            SizedBox(width: 8),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    task.title,
                                    style: TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w500,
                                      decoration: task.completed ? TextDecoration.lineThrough : null,
                                    ),
                                  ),
                                  if (task.description.isNotEmpty)
                                    Text(
                                      task.description,
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: Colors.grey[600],
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ).toList(),
                  ],
                ),
              ),
            ),
          
          // Tags
          if (order.tags.isNotEmpty)
            Card(
              margin: EdgeInsets.only(bottom: 16),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              elevation: 1,
              child: Padding(
                padding: EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Tags',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: theme.colorScheme.primary,
                      ),
                    ),
                    Divider(),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: order.tags.map((tag) => 
                        Chip(
                          label: Text(tag),
                          backgroundColor: theme.colorScheme.surfaceVariant,
                          labelStyle: TextStyle(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ).toList(),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
  
  // Zeiterfassungs-Tab
  Widget _buildTimeEntriesTab(BuildContext context, app_models.Order order) {
    ThemeData theme = Theme.of(context);
    
    return order.timeEntries.isEmpty
      ? Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.av_timer,
                size: 64,
                color: Colors.grey[400],
              ),
              SizedBox(height: 16),
              Text(
                'Keine Zeiteinträge vorhanden',
                style: TextStyle(
                  fontSize: 16,
                  color: Colors.grey[600],
                ),
              ),
            ],
          ),
        )
      : ListView.builder(
          padding: EdgeInsets.all(16),
          itemCount: order.timeEntries.length,
          itemBuilder: (context, index) {
            final entry = order.timeEntries[index];
            return Card(
              margin: EdgeInsets.only(bottom: 8),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              elevation: 1,
              child: Padding(
                padding: EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.person, color: Colors.blue, size: 16),
                        SizedBox(width: 8),
                        Text(
                          entry.userName,
                          style: TextStyle(
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        Spacer(),
                        Text(
                          _formatDate(entry.date),
                          style: TextStyle(
                            color: Colors.grey[700],
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                    Divider(),
                    Row(
                      children: [
                        Icon(Icons.timer, color: Colors.green, size: 16),
                        SizedBox(width: 8),
                        Text(
                          '${entry.hours} Stunden',
                          style: TextStyle(
                            fontWeight: FontWeight.w500,
                            color: Colors.green[700],
                          ),
                        ),
                        if (entry.billable)
                          Padding(
                            padding: EdgeInsets.only(left: 8),
                            child: Chip(
                              label: Text('Abrechenbar'),
                              backgroundColor: Colors.green[50],
                              labelStyle: TextStyle(
                                color: Colors.green[700],
                                fontSize: 10,
                              ),
                              visualDensity: VisualDensity.compact,
                              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            ),
                          ),
                      ],
                    ),
                    if (entry.description.isNotEmpty)
                      Padding(
                        padding: EdgeInsets.only(top: 8),
                        child: Text(
                          entry.description,
                          style: TextStyle(
                            fontSize: 13,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            );
          },
        );
  }
  
  // Aktionsbereich am unteren Rand
  Widget _buildActionArea(BuildContext context, app_models.Order order) {
    return Container(
      padding: EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        border: Border(
          top: BorderSide(color: Colors.grey.withOpacity(0.2)),
        ),
        borderRadius: BorderRadius.only(
          bottomLeft: Radius.circular(16),
          bottomRight: Radius.circular(16),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Status-spezifische Aktionen
          _buildStatusSpecificActions(context, order),
          
          SizedBox(height: 8),
          
          // Standard-Button
          ElevatedButton.icon(
            onPressed: () => Navigator.of(context).pop(),
            icon: Icon(Icons.close),
            label: Text('Schließen'),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.grey[200],
              foregroundColor: Colors.black,
            ),
          ),
        ],
      ),
    );
  }
  
  // Neue Hilfsmethode für statusspezifische Aktionen
  Widget _buildStatusSpecificActions(BuildContext context, app_models.Order order) {
    final bool isUserTeamLead = order.teamLeadId == widget.user.uid;
    
    switch (order.status) {
      case OrderStatus.draft:
        return SizedBox.shrink(); // Leeres Widget für Entwurf
      case OrderStatus.pending:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Kleine Statusanzeige statt großer Card
            Padding(
              padding: EdgeInsets.only(bottom: 12.0),
              child: Row(
                children: [
                  Icon(Icons.pending_actions, color: Colors.orange, size: 16),
                  SizedBox(width: 8),
                  Text(
                    'Auftrag wartet auf Bearbeitung',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: Colors.orange.shade800,
                    ),
                  ),
                ],
              ),
            ),
            
            // Buttons zum Annehmen und Ablehnen mit gleichmäßigem Abstand
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: () async {
                      final currentContext = context;
                      try {
                        // Dialog schließen
                        Navigator.of(currentContext).pop();
                        
                        // Ablehnungsgrund erfragen
                        if (!mounted) return;
                        
                        final String? reason = await showDialog<String>(
                          context: currentContext,
                          builder: (context) => AlertDialog(
                            title: Text('Auftrag ablehnen'),
                            content: Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Bitte geben Sie einen Grund für die Ablehnung an:'),
                                SizedBox(height: 8),
                                TextField(
                                  decoration: InputDecoration(
                                    border: OutlineInputBorder(),
                                    hintText: 'Ablehnungsgrund eingeben',
                                  ),
                                  maxLines: 3,
                                  onSubmitted: (value) {
                                    Navigator.of(context).pop(value);
                                  },
                                ),
                              ],
                            ),
                            actions: [
                              TextButton(
                                onPressed: () => Navigator.of(context).pop(),
                                child: Text('Abbrechen'),
                              ),
                              ElevatedButton(
                                onPressed: () {
                                  // Hier würde der Grund an _orderService.rejectOrder übergeben
                                  Navigator.of(context).pop('Ablehnungsgrund');
                                },
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: Colors.red,
                                ),
                                child: Text('Ablehnen'),
                              ),
                            ],
                          ),
                        );
                        
                        // Erneut prüfen, ob das Widget noch eingebunden ist
                        if (!mounted) return;
                        
                        if (reason != null && reason.isNotEmpty) {
                          // Hier würde _orderService.rejectOrder aufgerufen werden
                          ScaffoldMessenger.of(currentContext).showSnackBar(
                            SnackBar(content: Text('Auftrag abgelehnt: $reason')),
                          );
                        }
                      } catch (e) {
                        if (mounted) {
                          print('Fehler: $e');
                        }
                      }
                    },
                    icon: Icon(Icons.cancel, color: Colors.white, size: 18),
                    label: Text('Ablehnen'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.red,
                      foregroundColor: Colors.white,
                      minimumSize: Size(0, 40),
                    ),
                  ),
                ),
                SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: () async {
                      final currentContext = context;
                      try {
                        // Dialog schließen
                        Navigator.of(currentContext).pop();
                        
                        if (!mounted) return;
                        
                        // Ladeanimation anzeigen
                        showDialog(
                          context: currentContext,
                          barrierDismissible: false,
                          builder: (context) => const Center(child: CircularProgressIndicator()),
                        );
                        
                        // Auftrag annehmen
                        await _orderService.acceptOrder(order.id!);
                        
                        // Überprüfen, ob das Widget noch aktiv ist
                        if (!mounted) return;
                        
                        // Ladeanimation schließen
                        try {
                          Navigator.of(currentContext).pop();
                        } catch (_) {}
                        
                        // Erfolgsmeldung
                        ScaffoldMessenger.of(currentContext).showSnackBar(
                          const SnackBar(content: Text('Auftrag erfolgreich angenommen')),
                        );
                        
                        // UI aktualisieren
                        setState(() {});
                      } catch (e) {
                        if (mounted) {
                          // Ladeanimation schließen, falls geöffnet
                          try {
                            Navigator.of(currentContext).pop();
                          } catch (_) {}
                          
                          // Fehlermeldung
                          ScaffoldMessenger.of(currentContext).showSnackBar(
                            SnackBar(content: Text('Fehler beim Annehmen: $e')),
                          );
                        }
                      }
                    },
                    icon: Icon(Icons.check_circle, color: Colors.white, size: 18),
                    label: Text('Annehmen'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.green,
                      foregroundColor: Colors.white,
                      minimumSize: Size(0, 40),
                    ),
                  ),
                ),
              ],
            ),
          ],
        );
      case OrderStatus.approved:
      case OrderStatus.assigned:
      case OrderStatus.inProgress:
      case OrderStatus.completed:
      case OrderStatus.rejected:
      case OrderStatus.cancelled:
      default:
        return SizedBox.shrink(); // Leeres Widget für alle anderen Status
    }
  }
  
  // Hilfsmethode für den aktuellen Benutzer
  String get _currentUserId => widget.user.uid;
  
  // Dialog zum Ablehnen eines Auftrags
  void _showRejectOrderDialog(BuildContext context, app_models.Order order) {
    if (!mounted) return;
    
    final reasonController = TextEditingController();
    // Lokaler BuildContext für den Dialog
    final currentContext = context;
    
    showDialog(
      context: currentContext,
      builder: (dialogContext) => AlertDialog(
        title: Text('Auftrag ablehnen'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Auftrag: ${order.title}',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            SizedBox(height: 16),
            Text('Bitte geben Sie einen Grund für die Ablehnung an:'),
            SizedBox(height: 8),
            TextField(
              controller: reasonController,
              decoration: InputDecoration(
                labelText: 'Ablehnungsgrund',
                border: OutlineInputBorder(),
              ),
              maxLines: 3,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: Text('Abbrechen'),
          ),
          ElevatedButton(
            onPressed: () {
              final reason = reasonController.text.trim();
              if (reason.isEmpty) {
                ScaffoldMessenger.of(dialogContext).showSnackBar(
                  SnackBar(content: Text('Bitte geben Sie einen Ablehnungsgrund ein')),
                );
                return;
              }
              
              final btnContext = currentContext;
              final scaffoldMsg = ScaffoldMessenger.of(currentContext);
              
              // Dialog schließen
              Navigator.of(dialogContext).pop();
              
              WidgetsBinding.instance.addPostFrameCallback((_) async {
                if (!mounted) return;
                
                try {
                  // Ladeanimation anzeigen mit WillPopScope
                  showDialog(
                    context: btnContext,
                    barrierDismissible: false,
                    builder: (_) => const WillPopScope(
                      onWillPop: null,
                      child: Center(child: CircularProgressIndicator())
                    ),
                  );
                  
                  // Auftrag ablehnen
                  await _orderService.rejectOrder(order.id!, reason);
                  
                  // Nur fortfahren wenn Widget noch aktiv
                  if (!mounted) return;
                  
                  // Dialog schließen
                  try {
                    Navigator.of(btnContext).pop();
                  } catch (_) {}
                  
                  // UI aktualisieren und Meldung
                  scaffoldMsg.showSnackBar(
                    const SnackBar(content: Text('Auftrag erfolgreich abgelehnt')),
                  );
                  setState(() {});
                } catch (e) {
                  if (mounted) {
                    try {
                      Navigator.of(btnContext).pop();
                    } catch (_) {}
                    
                    scaffoldMsg.showSnackBar(
                      SnackBar(content: Text('Fehler beim Ablehnen: $e')),
                    );
                  }
                }
              });
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
            ),
            child: Text('Ablehnen'),
          ),
        ],
      ),
    );
  }
  
  // Formatiert ein Datum in das Format DD.MM.YYYY
  String _formatDate(DateTime date) {
    return '${date.day.toString().padLeft(2, '0')}.${date.month.toString().padLeft(2, '0')}.${date.year}';
  }
  
  // Formatiert ein Datum mit Uhrzeit
  String _formatDateWithTime(DateTime date) {
    return '${date.day.toString().padLeft(2, '0')}.${date.month.toString().padLeft(2, '0')}.${date.year} ${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
  }
  
  // Erstellt ein visuelles Badge für einen Auftragsstatus
  Widget _buildStatusBadge(OrderStatus status) {
    final Map<OrderStatus, Color> statusColors = {
      OrderStatus.draft: Colors.grey,
      OrderStatus.pending: Colors.orange,
      OrderStatus.approved: Colors.green,
      OrderStatus.assigned: Colors.blue,
      OrderStatus.inProgress: Colors.blue,
      OrderStatus.completed: Colors.teal,
      OrderStatus.rejected: Colors.red,
      OrderStatus.cancelled: Colors.brown,
    };
    
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: statusColors[status]?.withOpacity(0.2) ?? Colors.grey.withOpacity(0.2),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: statusColors[status] ?? Colors.grey,
          width: 1,
        ),
      ),
      child: Text(
        _getStatusText(status),
        style: TextStyle(
          color: statusColors[status],
          fontSize: 12,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }
  
  // Hilfsmethode zur Anzeige des Status-Textes
  String _getStatusText(OrderStatus status) {
    switch (status) {
      case OrderStatus.draft:
        return 'Entwurf';
      case OrderStatus.pending:
        return 'Ausstehend';
      case OrderStatus.approved:
        return 'Genehmigt';
      case OrderStatus.assigned:
        return 'Zugewiesen';
      case OrderStatus.inProgress:
        return 'In Bearbeitung';
      case OrderStatus.completed:
        return 'Abgeschlossen';
      case OrderStatus.rejected:
        return 'Abgelehnt';
      case OrderStatus.cancelled:
        return 'Storniert';
      default:
        return status.toString().split('.').last;
    }
  }

  void _showCustomerProjectFilter() {
    String? tempCustomerFilter = _customerFilter;
    String? tempProjectFilter = _projectFilter;
    
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Nach Kunde und Projekt filtern'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Kunde', style: TextStyle(fontWeight: FontWeight.bold)),
              DropdownButtonFormField<String>(
                value: tempCustomerFilter,
                decoration: InputDecoration(
                  hintText: 'Kunden auswählen',
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(value: 'Kunde A', child: Text('Kunde A')),
                  DropdownMenuItem(value: 'Kunde B', child: Text('Kunde B')),
                  DropdownMenuItem(value: 'Kunde C', child: Text('Kunde C')),
                ],
                onChanged: (value) {
                  tempCustomerFilter = value;
                  tempProjectFilter = null; // Projektfilter zurücksetzen bei Kundenwechsel
                },
              ),
              SizedBox(height: 16),
              Text('Projekt', style: TextStyle(fontWeight: FontWeight.bold)),
              DropdownButtonFormField<String>(
                value: tempProjectFilter,
                decoration: InputDecoration(
                  hintText: 'Projekt auswählen',
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(value: 'Projekt X', child: Text('Projekt X')),
                  DropdownMenuItem(value: 'Projekt Y', child: Text('Projekt Y')),
                  DropdownMenuItem(value: 'Projekt Z', child: Text('Projekt Z')),
                ],
                onChanged: (value) {
                  tempProjectFilter = value;
                },
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text('Abbrechen'),
          ),
          ElevatedButton(
            onPressed: () {
              setState(() {
                _customerFilter = tempCustomerFilter;
                _projectFilter = tempProjectFilter;
              });
              Navigator.of(context).pop();
            },
            child: Text('Anwenden'),
          ),
        ],
      ),
    );
  }

  void _showHelpDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Hilfe zur Auftragsbearbeitung'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildHelpSection(
                'Auftragsübersicht', 
                'Hier sehen Sie alle Aufträge, die für Sie relevant sind. '
                'Je nach Ihrer Rolle können Sie verschiedene Tabs und Filter verwenden.'
              ),
              Divider(),
              _buildHelpSection(
                'Aufträge filtern', 
                'Nutzen Sie die Filter am oberen Bildschirmrand, um Aufträge nach Status, '
                'Kunde oder Projekt zu filtern. Sie können auch nach Stichworten suchen.'
              ),
              Divider(),
              _buildHelpSection(
                'Genehmigungsprozess', 
                'Als Manager können Sie Aufträge genehmigen oder ablehnen. Dazu klicken Sie auf '
                'den entsprechenden Auftrag und wählen "Genehmigen" oder "Ablehnen".'
              ),
              Divider(),
              _buildHelpSection(
                'Zeiterfassung', 
                'Für Aufträge in Bearbeitung können Sie Zeit erfassen. Als Teamleiter können Sie '
                'auch für andere Teammitglieder Zeit buchen.'
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text('Schließen'),
          ),
        ],
      ),
    );
  }
  
  Widget _buildHelpSection(String title, String content) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 16,
          ),
        ),
        SizedBox(height: 8),
        Text(content),
        SizedBox(height: 8),
      ],
    );
  }

  void _showAddTimeEntryDialog(BuildContext context, app_models.Order order) {
    if (!mounted) return;
    
    // Prüfen, ob der Benutzer Teamleiter ist
    final bool isTeamLead = _isUserTeamLeadOfOrder(order);
    
    if (!isTeamLead) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Nur der Teamleiter darf Zeiten für den Auftrag erfassen')),
      );
      return;
    }
    
    final currentContext = context;
    final hoursController = TextEditingController(text: '1.0');
    final descriptionController = TextEditingController();
    final dateController = TextEditingController(
      text: '${DateTime.now().day}.${DateTime.now().month}.${DateTime.now().year}'
    );
    
    String? selectedTeamMember;
    
    // Teammitglieder aus dem Auftrag extrahieren
    final List<Map<String, dynamic>> teamMembers = [];
    
    // Alte Struktur prüfen
    if (order.assignedTo != null && order.assignedToName != null) {
      if (order.assignedTo is String && order.assignedToName is String) {
        teamMembers.add({
          'id': order.assignedTo,
          'name': order.assignedToName,
        });
      } else if (order.assignedTo is List && order.assignedToName is List) {
        for (int i = 0; i < (order.assignedTo as List).length; i++) {
          if (i < (order.assignedToName as List).length) {
            teamMembers.add({
              'id': (order.assignedTo as List)[i],
              'name': (order.assignedToName as List)[i],
            });
          }
        }
      }
    }
    
    // Neue Struktur prüfen
    if (order.assignedUsers != null) {
      for (var user in order.assignedUsers!) {
        teamMembers.add({
          'id': user.userId,
          'name': user.userName,
        });
      }
    }
    
    // Wenn keine Teammitglieder gefunden wurden, Fehler anzeigen
    if (teamMembers.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Keine Teammitglieder für diesen Auftrag gefunden')),
      );
      return;
    }
    
    showDialog(
      context: currentContext,
      builder: (dialogContext) => AlertDialog(
        title: Text('Zeit erfassen'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              DropdownButtonFormField<String>(
                decoration: InputDecoration(
                  labelText: 'Teammitglied',
                  border: OutlineInputBorder(),
                ),
                items: teamMembers.map((member) => 
                  DropdownMenuItem<String>(
                    value: member['id'] as String,
                    child: Text(member['name'] as String),
                  )
                ).toList(),
                onChanged: (value) {
                  selectedTeamMember = value;
                },
                value: teamMembers.isNotEmpty ? teamMembers[0]['id'] as String : null,
              ),
              SizedBox(height: 16),
              TextField(
                controller: dateController,
                decoration: InputDecoration(
                  labelText: 'Datum',
                  border: OutlineInputBorder(),
                  suffixIcon: IconButton(
                    icon: Icon(Icons.calendar_today),
                    onPressed: () async {
                      if (!mounted) return;
                      
                      final date = await showDatePicker(
                        context: dialogContext,
                        initialDate: DateTime.now(),
                        firstDate: DateTime(2020),
                        lastDate: DateTime.now().add(Duration(days: 1)),
                      );
                      
                      if (!mounted) return;
                      
                      if (date != null) {
                        dateController.text = '${date.day}.${date.month}.${date.year}';
                      }
                    },
                  ),
                ),
              ),
              SizedBox(height: 16),
              TextField(
                controller: hoursController,
                decoration: InputDecoration(
                  labelText: 'Stunden',
                  border: OutlineInputBorder(),
                ),
                keyboardType: TextInputType.numberWithOptions(decimal: true),
              ),
              SizedBox(height: 16),
              TextField(
                controller: descriptionController,
                decoration: InputDecoration(
                  labelText: 'Beschreibung',
                  border: OutlineInputBorder(),
                ),
                maxLines: 3,
              ),
              SizedBox(height: 8),
              CheckboxListTile(
                title: Text('Abrechenbar'),
                value: true,
                onChanged: (value) {},
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: Text('Abbrechen'),
          ),
          ElevatedButton(
            onPressed: () async {
              final notes = descriptionController.text.trim();
              if (notes.isEmpty) {
                ScaffoldMessenger.of(dialogContext).showSnackBar(
                  SnackBar(content: Text('Bitte geben Sie eine Beschreibung ein')),
                );
                return;
              }
              
              // Zeit überprüfen
              final hoursText = hoursController.text.trim();
              double hours = 0;
              try {
                hours = double.parse(hoursText.replaceAll(',', '.'));
                if (hours <= 0) throw FormatException('Zeit muss größer als 0 sein');
              } catch (e) {
                ScaffoldMessenger.of(dialogContext).showSnackBar(
                  SnackBar(content: Text('Bitte geben Sie eine gültige Stundenanzahl ein')),
                );
                return;
              }
              
              // Teammitglied prüfen
              if (selectedTeamMember == null) {
                ScaffoldMessenger.of(dialogContext).showSnackBar(
                  SnackBar(content: Text('Bitte wählen Sie ein Teammitglied aus')),
                );
                return;
              }
              
              // Dialog schließen und Daten speichern
              Navigator.of(dialogContext).pop();
              
              if (!mounted) return;
              
              try {
                // Ladeanimation anzeigen
                showDialog(
                  context: currentContext,
                  barrierDismissible: false,
                  builder: (context) => Center(child: CircularProgressIndicator()),
                );
                
                // Zeit erfassen
                await _orderService.addTimeEntryAsTeamLead(
                  order.id!,
                  selectedTeamMember!,
                  hours,
                  notes,
                  isTeamLead
                );
                
                // Ladeanimation schließen
                Navigator.of(currentContext).pop();
                
                // Erfolg anzeigen
                ScaffoldMessenger.of(currentContext).showSnackBar(
                  SnackBar(content: Text('Zeit erfolgreich erfasst')),
                );
                
                // UI aktualisieren
                _loadOrders();
              } catch (e) {
                // Ladeanimation schließen
                Navigator.of(currentContext).pop();
                
                // Fehler anzeigen
                ScaffoldMessenger.of(currentContext).showSnackBar(
                  SnackBar(content: Text('Fehler: $e')),
                );
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Theme.of(dialogContext).colorScheme.primary,
              foregroundColor: Colors.white,
            ),
            child: Text('Speichern'),
          ),
        ],
      ),
    );
  }

  void _showCompleteOrderDialog(BuildContext context, app_models.Order order) {
    if (!mounted) return;
    
    // Prüfen, ob der Benutzer Teamleiter ist
    final bool isTeamLead = _isUserTeamLeadOfOrder(order);
    
    if (!isTeamLead) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Nur der Teamleiter darf den Auftrag abschließen')),
      );
      return;
    }
    
    // Prüfen, ob für alle Teammitglieder Zeiten erfasst wurden
    bool allTimesRecorded = true;
    String missingTimeMembers = "";
    
    if (order.assignedUsers != null) {
      for (var user in order.assignedUsers!) {
        // Überprüfen, ob bereits Zeiten erfasst wurden
        // Annahme: timeSpent ist im metadata-Map gespeichert
        var timeSpent = 0.0;
        
        if (user.id != null && order.timeEntries.isNotEmpty) {
          // Suche nach Zeiteinträgen für diesen Benutzer
          var userEntries = order.timeEntries.where((entry) => entry.userId == user.userId);
          if (userEntries.isNotEmpty) {
            timeSpent = userEntries.fold(0.0, (sum, entry) => sum + entry.hours);
          }
        }
        
        if (timeSpent <= 0) {
          allTimesRecorded = false;
          missingTimeMembers += "- ${user.userName}\n";
        }
      }
    }
    
    if (!allTimesRecorded) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Bitte erfassen Sie zuerst Zeiten für alle Teammitglieder:\n$missingTimeMembers'),
          duration: Duration(seconds: 5),
        ),
      );
      
      // Dialog zur Zeiterfassung anzeigen
      _showAddTimeEntryDialog(context, order);
      return;
    }
    
    final currentContext = context;
    final completionNotes = TextEditingController();
    
    showDialog(
      context: currentContext,
      builder: (dialogContext) => AlertDialog(
        title: Text('Auftrag abschließen'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Alle Zeiten wurden erfasst. Möchten Sie den Auftrag jetzt abschließen?'),
            SizedBox(height: 16),
            TextField(
              controller: completionNotes,
              decoration: InputDecoration(
                labelText: 'Abschlussnotiz',
                border: OutlineInputBorder(),
              ),
              maxLines: 3,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: Text('Abbrechen'),
          ),
          ElevatedButton(
            onPressed: () async {
              final notes = completionNotes.text.trim();
              if (notes.isEmpty) {
                ScaffoldMessenger.of(dialogContext).showSnackBar(
                  SnackBar(content: Text('Bitte geben Sie eine Abschlussnotiz ein')),
                );
                return;
              }
              
              // Dialog schließen
              Navigator.of(dialogContext).pop();
              
              if (!mounted) return;
              
              try {
                // Lade-Dialog anzeigen
                showDialog(
                  context: currentContext,
                  barrierDismissible: false,
                  builder: (context) => Center(child: CircularProgressIndicator()),
                );
                
                // Auftrag abschließen
                await _orderService.completeOrderAsTeamLead(
                  order.id!,
                  widget.user.uid,
                  notes
                );
                
                // Lade-Dialog schließen
                Navigator.of(currentContext).pop();
                
                // Erfolgsmeldung anzeigen
                ScaffoldMessenger.of(currentContext).showSnackBar(
                  SnackBar(content: Text('Auftrag erfolgreich abgeschlossen')),
                );
                
                // UI aktualisieren
                _loadOrders();
              } catch (e) {
                // Lade-Dialog schließen
                Navigator.of(currentContext).pop();
                
                // Fehlermeldung anzeigen
                ScaffoldMessenger.of(currentContext).showSnackBar(
                  SnackBar(content: Text('Fehler: $e')),
                );
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.teal,
              foregroundColor: Colors.white,
            ),
            child: Text('Abschließen'),
          ),
        ],
      ),
    );
  }

  // Hilfsmethode zum Erstellen von Filter-Chips
  Widget _buildFilterChip({
    required String label,
    required bool isSelected,
    required Function(bool) onSelected,
  }) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: FilterChip(
        label: Text(label),
        selected: isSelected,
        onSelected: onSelected,
        backgroundColor: Colors.grey.shade200,
        selectedColor: Theme.of(context).colorScheme.primary.withOpacity(0.2),
        checkmarkColor: Theme.of(context).colorScheme.primary,
      ),
    );
  }

  // AutomaticKeepAliveClientMixin-Implementierung
  @override
  bool get wantKeepAlive => true;

  // Neuer Tab für die Karte - jetzt viel einfacher mit dem ausgelagerten Widget
  Widget _buildMapsTab(BuildContext context, app_models.Order order) {
    return OrderMapWidget(order: order);
  }
  
  // Hilfsmethode zum Öffnen von Google Maps - nutze jetzt die statische Methode aus dem OrderMapWidget
  Future<void> _openInMaps(String address) async {
    await OrderMapWidget.openInMaps(address);
  }

  // Methode zum Überprüfen, ob der aktuelle Benutzer der Teamleiter eines Auftrags ist
  bool _isUserTeamLeadOfOrder(app_models.Order order) {
    // Prüfen, ob die assignedUsers existieren
    if (order.assignedUsers == null || order.assignedUsers!.isEmpty) {
      // Alte Struktur prüfen: Ist der Benutzer der in teamLeadId angegebene?
      return order.teamLeadId == widget.user.uid;
    }
    
    // Neue Struktur: Prüfen, ob der Benutzer in assignedUsers als Teamleiter markiert ist
    for (var user in order.assignedUsers!) {
      if (user.userId == widget.user.uid && user.isTeamLead) {
        return true;
      }
    }
    return false;
  }
  
  // Methode zum Setzen eines Auftrags in Bearbeitung (nur für Teamleiter)
  Future<void> _setOrderInProgress(app_models.Order order) async {
    if (!_isUserTeamLeadOfOrder(order)) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Nur der Teamleiter darf den Auftrag in Bearbeitung setzen')),
      );
      return;
    }
    
    try {
      // Ladeanimation anzeigen
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (context) => Center(child: CircularProgressIndicator()),
      );
      
      // Auftrag in Bearbeitung setzen
      await _orderService.startProcessingOrder(order.id!, widget.user.uid);
      
      // Ladeanimation schließen
      Navigator.of(context).pop();
      
      // Erfolg anzeigen
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Auftrag erfolgreich in Bearbeitung gesetzt')),
      );
      
      // UI aktualisieren
      _loadOrders();
    } catch (e) {
      // Ladeanimation schließen
      Navigator.of(context).pop();
      
      // Fehler anzeigen
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Fehler: $e')),
      );
    }
  }

  // Methode zur Diagnose der Firebase-Verbindung
  Future<void> _runDatabaseDiagnostics() async {
    try {
      print("🔍 Starte Datenbankdiagnose...");
      final diagnosticResult = await _orderService.diagnoseDatabaseConnection();
      
      print("📊 Diagnose-Ergebnis:");
      print("  - Collection existiert: ${diagnosticResult['collectionExists']}");
      print("  - Anzahl Dokumente: ${diagnosticResult['documentCount']}");
      
      if ((diagnosticResult['documentCount'] as int) > 0) {
        print("  - Beispiel-Dokument-IDs: ${diagnosticResult['sampleDocumentIds']}");
        
        // Wenn Dokumente vorhanden sind, aber keine in der Ansicht erscheinen
        if (_filteredOrders.isEmpty) {
          print("⚠️ KRITISCHES PROBLEM: Dokumente existieren in der Datenbank, werden aber nicht angezeigt!");
          print("  - Prüfe Status-Filter: $_statusFilter");
          print("  - Prüfe View-Mode: $_viewMode");
        }
      } else {
        print("⚠️ KRITISCHES PROBLEM: Keine Dokumente in der 'orders'-Collection gefunden!");
      }
      
      // Prüfe Authentifizierung
      print("  - Benutzer authentifiziert: ${diagnosticResult['userAuthenticated']}");
      print("  - Benutzer-ID: ${diagnosticResult['userId']}");
      
      // Prüfe Schreibzugriff
      print("  - Schreibzugriff erfolgreich: ${diagnosticResult['writeAccessSuccessful']}");
      
      print("✅ Datenbankdiagnose abgeschlossen");
    } catch (e) {
      print("❌ Fehler bei der Datenbankdiagnose: $e");
    }
  }
} 