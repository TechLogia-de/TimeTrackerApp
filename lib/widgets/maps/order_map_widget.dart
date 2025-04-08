import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import 'dart:async';
import '../../models/order_model.dart';

/// Eine Widget-Klasse, die einen Auftrag auf einer Google Maps-Karte anzeigt
class OrderMapWidget extends StatelessWidget {
  final Order order;
  
  const OrderMapWidget({
    Key? key, 
    required this.order,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    ThemeData theme = Theme.of(context);
    
    // Standard-Position (Berlin)
    final defaultPosition = LatLng(52.520008, 13.404954);
    
    // Koordinaten aus dem Auftrag extrahieren, falls vorhanden
    final LatLng projectPosition = (order.projectLatitude != null && order.projectLongitude != null)
      ? LatLng(order.projectLatitude!, order.projectLongitude!)
      : defaultPosition;
    
    // Marker für das Projekt
    final Completer<GoogleMapController> _controller = Completer();
    final Set<Marker> markers = {
      Marker(
        markerId: MarkerId(order.id ?? "project"),
        position: projectPosition,
        infoWindow: InfoWindow(
          title: order.projectName ?? "Projektstandort",
          snippet: order.projectLocation ?? "Keine Adresse verfügbar",
        ),
      ),
    };
    
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Adressheader
        Container(
          padding: EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Projektstandort',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: theme.colorScheme.primary,
                ),
              ),
              SizedBox(height: 8),
              
              if (order.projectLocation != null && order.projectLocation!.isNotEmpty)
                InkWell(
                  onTap: () => openInMaps(order.projectLocation!),
                  child: Row(
                    children: [
                      Icon(Icons.location_on, color: Colors.red),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          order.projectLocation!,
                          style: TextStyle(
                            color: Colors.blue,
                            decoration: TextDecoration.underline,
                          ),
                        ),
                      ),
                      SizedBox(width: 8),
                      ElevatedButton.icon(
                        onPressed: () => openInMaps(order.projectLocation!),
                        icon: Icon(Icons.directions, size: 16),
                        label: Text('Route'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.blue,
                          foregroundColor: Colors.white,
                          padding: EdgeInsets.symmetric(horizontal: 12, vertical: 0),
                          minimumSize: Size(0, 36),
                        ),
                      ),
                    ],
                  ),
                )
              else
                Text(
                  'Keine Adresse verfügbar',
                  style: TextStyle(
                    color: Colors.grey,
                    fontStyle: FontStyle.italic,
                  ),
                ),
            ],
          ),
        ),
        
        // Karte
        Expanded(
          child: (order.projectLatitude != null && order.projectLongitude != null || order.projectLocation != null)
            ? GoogleMap(
                mapType: MapType.normal,
                initialCameraPosition: CameraPosition(
                  target: projectPosition,
                  zoom: 14,
                ),
                markers: markers,
                onMapCreated: (GoogleMapController controller) {
                  _controller.complete(controller);
                },
              )
            : Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.map,
                      size: 64,
                      color: Colors.grey[400],
                    ),
                    SizedBox(height: 16),
                    Text(
                      'Keine Standortdaten verfügbar',
                      style: TextStyle(
                        fontSize: 16,
                        color: Colors.grey[600],
                      ),
                    ),
                  ],
                ),
              ),
        ),
      ],
    );
  }

  /// Öffnet Google Maps mit der angegebenen Adresse
  static Future<void> openInMaps(String address) async {
    final url = Uri.parse('https://www.google.com/maps/search/?api=1&query=${Uri.encodeComponent(address)}');
    if (await canLaunchUrl(url)) {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    } else {
      print('Konnte Maps nicht öffnen: $url');
    }
  }
} 